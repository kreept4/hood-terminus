import type { ContractFacts } from "./contract";
import { POWER_WORDS } from "./contract";
import { LAUNCHPAD_DEXES, type MarketPool, type TokenInfo } from "./market";
import type { HookProfile } from "./pool";
import type { SimulationOutcome } from "./simulate";
import type { Check, Verdict } from "./types";

/**
 * Turning findings into checks a trader can read in one pass.
 *
 * Thresholds are deliberately plain. A round trip that loses a quarter of the
 * trade is a fail whatever the reason; a pool with less than ten thousand
 * dollars in it is a warning because a sell will move the price, not because
 * anything is wrong with the token. Every detail line says what was observed,
 * not what we infer about anyone's intent.
 */

const FAIL_TAX = 25;
const WARN_TAX = 5;
const FAIL_ROUND_TRIP = 35;
const WARN_ROUND_TRIP = 10;
const WARN_TOP10 = 50;
const WARN_DEVELOPER = 10;
const WARN_LIQUIDITY = 10_000;
const DAY_MS = 86_400_000;

const pct = (n: number) => `${n < 10 ? n.toFixed(2) : n.toFixed(1)}%`;
const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n.toFixed(0)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const list = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export type Findings = {
  info: TokenInfo | null;
  pool: MarketPool | null;
  /**
   * A pool was located and could be simulated against, from the market feed or
   * from the factory. Distinct from `pool`, which is only the market feed's
   * view: the fallback finds a pool the feed knows nothing about, and the sell
   * check has to key off whether there was anything to test rather than off
   * whether a data provider happened to describe it.
   */
  poolFound: boolean;
  /** The pool list itself could not be fetched, as distinct from the token having no pools. */
  marketUnavailable: boolean;
  facts: ContractFacts | null;
  hook: HookProfile | null;
  sim: SimulationOutcome | null;
};

export function buildChecks({
  info,
  pool,
  poolFound,
  marketUnavailable,
  facts,
  hook,
  sim,
}: Findings): Check[] {
  const checks: Check[] = [];
  const venue = pool ? pool.name : "its main pool";

  /* Selling: the one check everything else is secondary to. */
  if (!poolFound) {
    checks.push({
      id: "sell",
      label: "Test sell",
      status: "unknown",
      detail: marketUnavailable
        ? "The market data feed is down right now, so we could not find a pool to test in. Try again shortly."
        : "This token has nowhere to trade yet, so there is nothing to test.",
    });
  } else if (!sim || sim.inconclusive) {
    checks.push({
      id: "sell",
      label: "Test sell",
      status: "unknown",
      /**
       * The reason is shown, not swallowed.
       *
       * "Couldn't run a test trade" on its own is the least useful sentence
       * this product can print: it reads as the tool being broken, and gives
       * nobody anything to act on or report. The simulator already records why
       * it stopped, and some of those reasons are the answer rather than an
       * excuse. A pool whose quote asset cannot be funded is a pool a buyer
       * would struggle in too.
       */
      detail: sim?.failure
        ? `The test trade in ${venue} could not run: ${sim.failure}. This is not a pass.`
        : `The test trade in ${venue} could not run. This is not a pass.`,
    });
  } else if (sim.sellBlocked) {
    checks.push({
      id: "sell",
      label: "Test sell",
      status: "fail",
      detail: sim.sellOnly
        ? `A test sell in ${venue} failed.`
        : `Buying worked in ${venue}, but selling it straight back failed.`,
    });
  } else {
    checks.push({
      id: "sell",
      label: "Test sell",
      status: "pass",
      detail: sim.sellOnly
        ? `A test sell in ${venue} worked.`
        : `We bought ${sim.tradeUsd?.toFixed(0)} in ${venue} and sold it straight back. Both worked.`,
    });
  }

  /* What a trade actually costs. */
  if (sim && !sim.inconclusive && !sim.sellBlocked) {
    const tax = Math.max(sim.buyTaxPct ?? 0, sim.sellTaxPct ?? 0);
    const trip = sim.roundTripPct;
    const taxed = (sim.buyTaxPct ?? 0) >= 0.5 || (sim.sellTaxPct ?? 0) >= 0.5;
    let detail: string;
    if (trip === null) {
      // Sell-only run: there is no round trip to report, only what the sell paid out.
      detail = taxed
        ? `The token keeps ${pct(sim.sellTaxPct ?? 0)} of every sale for itself.`
        : "The sale paid out exactly what was quoted. The token takes no cut of its own.";
    } else {
      const parts = [`Buying and selling straight back loses ${pct(trip)}`];
      if (taxed) parts.push(`the token itself keeps ${pct(sim.buyTaxPct ?? 0)} when you buy and ${pct(sim.sellTaxPct ?? 0)} when you sell`);
      else parts.push("the token takes no cut of its own, so that is the exchange fee and the price moving as you trade");
      detail = `${parts.join("; ")}.`;
    }

    const status =
      tax >= FAIL_TAX || (trip ?? 0) >= FAIL_ROUND_TRIP ? "fail" : tax >= WARN_TAX || (trip ?? 0) >= WARN_ROUND_TRIP ? "warn" : "pass";
    checks.push({ id: "tax", label: "Cost to trade", status, detail });
  }

  /* A second opinion. */
  if (info?.geckoHoneypot === true) {
    checks.push({ id: "flagged", label: "Scam reports", status: "fail", detail: "This token is reported as a scam by the market data provider." });
  } else if (info?.geckoHoneypot === false) {
    checks.push({ id: "flagged", label: "Scam reports", status: "pass", detail: "No scam reports against this token from the market data provider." });
  }

  /* Who holds the switches. */
  if (facts?.isContract) {
    const powers = facts.powers.filter((p) => p !== "upgrade");
    const words = list(powers.map((p) => POWER_WORDS[p]));
    if (powers.length === 0) {
      checks.push({
        id: "owner",
        label: "What the owner can do",
        status: "pass",
        detail: "Nobody can create new tokens, block your wallet, freeze trading or change the fees.",
      });
    } else if (facts.ownerRenounced) {
      checks.push({
        id: "owner",
        label: "What the owner can do",
        status: "pass",
        detail: `The contract can ${words}, but the owner gave up control, so nobody can do any of it.`,
      });
    } else if (facts.owner) {
      checks.push({
        id: "owner",
        label: "What the owner can do",
        status: "warn",
        detail: `The owner, ${short(facts.owner)}, can ${words}.`,
      });
    } else {
      checks.push({
        id: "owner",
        label: "What the owner can do",
        status: "warn",
        detail: `The contract can ${words}, and it does not say who controls that.`,
      });
    }

    if (facts.proxyKind === "erc1967" || facts.proxyKind === "beacon") {
      checks.push({
        id: "upgrade",
        label: "Can the code change",
        status: facts.upgradeAdmin ? "warn" : "pass",
        detail: facts.upgradeAdmin
          ? `${short(facts.upgradeAdmin)} can replace this token's code at any time, and change what it does.`
          : "The code is replaceable in principle, but nobody holds the power to replace it.",
      });
    } else {
      checks.push({ id: "upgrade", label: "Can the code change", status: "pass", detail: "The code is fixed. Nobody can replace it later." });
    }
  }

  /* The pool's own rules, for v4. */
  if (hook) {
    const launchpad = pool ? LAUNCHPAD_DEXES[pool.dex] : undefined;
    if (!hook.present) {
      checks.push({ id: "hook", label: "Extra pool rules", status: "pass", detail: "No extra rules. This pool trades the normal way." });
    } else if (launchpad) {
      checks.push({
        id: "hook",
        label: "Extra pool rules",
        status: "pass",
        detail: `Runs ${launchpad}'s launchpad hook${hook.dynamicFee ? ", which sets the fee on every trade" : hook.changesSwapAmounts ? ", which takes its fee out of each swap" : ""}. The trading cost above includes it.`,
      });
    } else if (hook.changesSwapAmounts || hook.dynamicFee) {
      checks.push({
        id: "hook",
        label: "Extra pool rules",
        status: "warn",
        detail: hook.dynamicFee
          ? "Runs a custom hook that sets the fee on every trade, so the cost can change after this check."
          : "Runs a custom hook that can change what you receive on a swap.",
      });
    } else {
      checks.push({
        id: "hook",
        label: "Extra pool rules",
        status: "pass",
        detail: hook.touchesSwaps ? "Runs a hook that sees swaps but cannot change their amounts." : "Runs a hook that does not touch swaps.",
      });
    }
  }

  /* Who holds the supply. */
  if (info?.top10Pct !== null && info?.top10Pct !== undefined) {
    checks.push({
      id: "holders",
      label: "Top holders",
      status: info.top10Pct >= WARN_TOP10 ? "warn" : "pass",
      detail: `The 10 largest wallets hold ${pct(info.top10Pct)} of the supply${info.holderCount ? ` across ${info.holderCount.toLocaleString("en-US")} holders` : ""}. Pools and launchpad contracts can be among them.`,
    });
  }
  if (info?.developerPct !== null && info?.developerPct !== undefined) {
    checks.push({
      id: "developer",
      label: "Creator holdings",
      status: info.developerPct >= WARN_DEVELOPER ? "warn" : "pass",
      detail: `The creator's wallet holds ${pct(info.developerPct)} of the supply.`,
    });
  }

  /* The market around it. */
  if (pool?.liquidityUsd !== null && pool?.liquidityUsd !== undefined) {
    checks.push({
      id: "liquidity",
      label: "Liquidity",
      status: pool.liquidityUsd < WARN_LIQUIDITY ? "warn" : "pass",
      detail:
        pool.liquidityUsd < WARN_LIQUIDITY
          ? `Only ${usd(pool.liquidityUsd)} in the pool, so a larger sell will move the price hard.`
          : `${usd(pool.liquidityUsd)} in ${pool.name}.`,
    });
  }
  if (pool && pool.buys24h !== null && pool.sells24h !== null) {
    const lopsided = pool.buys24h >= 30 && pool.sells24h < pool.buys24h * 0.05;
    checks.push({
      id: "activity",
      label: "Buys and sells",
      status: lopsided ? "warn" : "pass",
      detail: `${pool.buys24h.toLocaleString("en-US")} buys and ${pool.sells24h.toLocaleString("en-US")} sells in the last 24 hours${lopsided ? ". Almost nobody is selling, which is how a blocked sell looks from outside" : ""}.`,
    });
  }
  if (pool?.createdAt) {
    const age = Date.now() - Date.parse(pool.createdAt);
    const hours = Math.floor(age / 3_600_000);
    checks.push({
      id: "age",
      label: "Pool age",
      status: age < DAY_MS ? "warn" : "pass",
      detail: age < DAY_MS ? `The pool is ${hours < 1 ? "under an hour" : `${hours} hour${hours === 1 ? "" : "s"}`} old.` : `Trading for ${Math.floor(age / DAY_MS)} days.`,
    });
  }

  return checks;
}

export function verdictOf(checks: Check[]): Verdict {
  if (checks.some((c) => c.status === "fail")) return "danger";
  if (checks.find((c) => c.id === "sell")?.status === "unknown") return "unknown";
  if (checks.some((c) => c.status === "warn")) return "caution";
  return "clear";
}

export function headlineOf(verdict: Verdict, checks: Check[], sim: SimulationOutcome | null): string {
  const warnings = checks.filter((c) => c.status === "warn").length;
  switch (verdict) {
    case "danger": {
      if (sim?.sellBlocked) return "You cannot sell this token. If you buy it, your money stays in it.";
      const cost = checks.find((c) => c.id === "tax" && c.status === "fail");
      if (cost && sim?.roundTripPct !== null && sim?.roundTripPct !== undefined)
        return `You lose ${pct(sim.roundTripPct)} buying it and selling it straight back.`;
      if (cost) return "This token charges a large fee every time it is traded.";
      return checks.find((c) => c.status === "fail")?.detail ?? "Something here failed. Read the checks before trading.";
    }
    case "unknown":
      return "The sell test could not run, so nobody can say this token is safe to buy.";
    case "caution":
      return `You can sell it. ${warnings} thing${warnings === 1 ? "" : "s"} to know before you buy.`;
    case "clear":
      return sim?.roundTripPct !== null && sim?.roundTripPct !== undefined
        ? `You can sell it. Buying ${sim.tradeUsd?.toFixed(0)} and selling it straight back costs ${pct(sim.roundTripPct)}.`
        : "You can sell it, and nothing else looked wrong.";
  }
}
