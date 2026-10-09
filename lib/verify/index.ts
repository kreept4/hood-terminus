import "server-only";
import { getAddress, type Address, type Hex } from "viem";
import { robinhoodChain } from "@/lib/chain";
import { readContractFacts, type ContractFacts } from "./contract";
import { tokenInfo, tokenPools, type MarketPool, type TokenInfo } from "./market";
import {
  deepestPoolOnChain,
  hookProfile,
  poolKind,
  v4PoolKey,
  type HookProfile,
  type PoolKey,
} from "./pool";
import { CONTRACTS } from "@/lib/chain/contracts";
import { buildChecks, headlineOf, verdictOf } from "./score";
import { simulateRoundTrip, type SimulationOutcome } from "./simulate";
import type { PoolKind, VerifyReport } from "./types";

export type { VerifyReport, Check, CheckStatus, Verdict } from "./types";

/**
 * Verify: is it safe to buy this, and can I get out?
 *
 * Gathers three independent views and checks them against each other: what the
 * token contract allows, what the market data says, and what actually happens
 * when a small trade is simulated through the pool people use. The simulation
 * decides the verdict; the rest explains it.
 *
 * Reports are cached for a minute per token. A trader opening the same token
 * twice should not cost two simulations, and nothing here changes that fast.
 */

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; report: VerifyReport }>();
const inFlight = new Map<string, Promise<VerifyReport>>();

/** Run a step that is allowed to fail. A failed step becomes an unknown, never a pass. */
async function attempt<T>(step: () => Promise<T>): Promise<T | null> {
  try {
    return await step();
  } catch {
    return null;
  }
}

export async function verifyToken(input: Address): Promise<VerifyReport> {
  const token = getAddress(input);
  const key = token.toLowerCase();

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.report;

  const running = inFlight.get(key);
  if (running) return running;

  const work = run(token).finally(() => inFlight.delete(key));
  inFlight.set(key, work.then((r) => r.report));
  const { report, complete } = await work;
  // A report missing its market data is shown, but not kept: the next request should try again.
  if (complete) cache.set(key, { at: Date.now(), report });
  return report;
}

async function run(token: Address): Promise<{ report: VerifyReport; complete: boolean }> {
  const [info, pools, facts] = await Promise.all([
    attempt<TokenInfo | null>(() => tokenInfo(token)),
    attempt<MarketPool[] | null>(() => tokenPools(token)),
    attempt<ContractFacts>(() => readContractFacts(token)),
  ]);

  // Simulate where the liquidity is, because that is where a real sell would go.
  const marketUnavailable = pools === null;
  const pool = pools?.[0] ?? null;
  let kind: PoolKind = "other";
  let poolKey: PoolKey | null = null;
  let hook: HookProfile | null = null;
  let sim: SimulationOutcome | null = null;

  /**
   * The pool to test against, from the chain when the data provider has nothing.
   *
   * Verify only ever found pools through GeckoTerminal, so a failed or
   * uncovered request meant no simulation and a verdict of Unknown reading
   * "market data is unavailable". It said that about USDG against WETH, one of
   * the busiest pairs on this chain, which is the clearest possible sign the
   * check was measuring somebody else's uptime rather than the token.
   *
   * The factory knows where the pool is without being asked nicely. Falling
   * back to it keeps the one check people come here for working when the market
   * feed is down, which is also exactly when a new token is least documented
   * and most worth checking.
   */
  const onChainPool =
    !pool && facts?.isContract
      ? await attempt(() =>
          deepestPoolOnChain(token, [CONTRACTS.weth as Address]),
        )
      : null;

  const poolId = pool?.id ?? onChainPool ?? null;

  if (poolId && facts?.isContract) {
    kind = (await attempt(() => poolKind(poolId))) ?? "other";
    if (kind === "v4") {
      poolKey = await attempt(() => v4PoolKey(poolId as Hex, pool?.createdAt ?? null));
      if (poolKey) hook = hookProfile(poolKey);
    }
    sim = await attempt(() =>
      simulateRoundTrip({
        token,
        kind,
        poolId,
        key: poolKey,
        // Everything below this line is market data decorating the result. It
        // is absent on the fallback, and the simulation does not need it: the
        // pool's own contracts carry the tokens and the reserves.
        dex: pool?.dex ?? "uniswap_v3",
        liquidityUsd: pool?.liquidityUsd ?? null,
        quotePriceUsd: pool?.quotePriceUsd ?? null,
        tokenPriceUsd: pool?.tokenPriceUsd ?? null,
      }),
    );
  }

  const checks = buildChecks({
    info,
    pool,
    poolFound: Boolean(poolId),
    marketUnavailable,
    facts,
    hook,
    sim,
  });
  const verdict = verdictOf(checks);

  const report: VerifyReport = {
    token,
    chainId: robinhoodChain.id,
    checkedAt: new Date().toISOString(),
    name: info?.name ?? null,
    symbol: info?.symbol ?? null,
    verdict,
    headline: headlineOf(verdict, checks, sim),
    pool: pool
      ? {
          id: pool.id,
          kind,
          dex: pool.dex,
          name: pool.name,
          quoteSymbol: pool.quoteSymbol,
          liquidityUsd: pool.liquidityUsd,
          createdAt: pool.createdAt,
          hooks: poolKey?.hooks ?? null,
        }
      : null,
    simulation:
      sim && !sim.inconclusive
        ? {
            tradeUsd: sim.tradeUsd,
            roundTripPct: sim.roundTripPct,
            buyTaxPct: sim.buyTaxPct,
            sellTaxPct: sim.sellTaxPct,
            sellBlocked: sim.sellBlocked,
            sellOnly: sim.sellOnly,
          }
        : null,
    checks,
  };
  return { report, complete: !marketUnavailable && info !== null };
}
