import "server-only";
import {
  concat,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  pad,
  parseAbi,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { verifyClient, NATIVE, V4_POOL_MANAGER, WETH } from "./client";
import type { PoolKey } from "./pool";
import { VERIFY_SIM_ABI, VERIFY_SIM_RUNTIME } from "./sim-artifact";
import type { PoolKind, SimulationSummary } from "./types";

/**
 * A real buy and sell, run inside one eth_call that changes nothing.
 *
 * The simulator contract (contracts/verify/VerifySim.sol) is injected at a
 * throwaway address with a state override and handed some ETH. It buys a small
 * amount through the pool, sells all of it straight back, and reports what the
 * pool promised against what actually arrived on each leg. A token that blocks
 * sells, taxes transfers or hides a fee in its pool hook shows up in those gaps.
 *
 * When the pool trades against something other than ETH, the simulator needs a
 * balance of that asset instead. That is granted by overriding the asset's
 * storage, which first means finding the slot that holds balances.
 */

const SIM = "0xf00df00df00df00df00df00df00df00df00df00d" as const;
const CALLER = "0x7e57000000000000000000000000000000000001" as const;
const GAS = 30_000_000n;

/** Ten dollars is enough to exercise every fee path and too small to move a real pool. */
const TRADE_USD = 10;
/** Never simulate more than this share of the pool's liquidity. */
const MAX_SHARE_OF_LIQUIDITY = 0.005;

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

const ZERO_KEY: PoolKey = { currency0: NATIVE, currency1: NATIVE, fee: 0, tickSpacing: 0, hooks: NATIVE };

/* ─────────────────────────── finding a balance slot ─────────────────────────── */

/** Large enough that no real balance collides with a marker. */
const MARKER_BASE = 1n << 200n;

/** OpenZeppelin v5 upgradeable ERC-20 keeps balances under this ERC-7201 namespace. Robinhood's stock tokens use it. */
const OZ_ERC20_NAMESPACE = "0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00";
/** Solady's ERC-20 derives balance slots from the owner and this seed. */
const SOLADY_BALANCE_SEED = "0x000000000000000087a211a2";

function candidateSlots(holder: Address): Hex[] {
  const slots: Hex[] = [];
  for (let i = 0n; i < 60n; i++) {
    // Solidity mappings: keccak(key . slot). Vyper: keccak(slot . key).
    slots.push(keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [holder, i])));
    slots.push(keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "address" }], [i, holder])));
  }
  slots.push(keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [holder, OZ_ERC20_NAMESPACE])));
  slots.push(keccak256(concat([holder, SOLADY_BALANCE_SEED])));
  return slots;
}

const slotCache = new Map<string, Hex | null>();

/**
 * Finds the storage slot behind `balanceOf(holder)` in a single call.
 *
 * Every candidate slot is overridden at once, each with a different marker
 * value, and `balanceOf` is asked once. Whichever marker comes back names the
 * slot it read. One round trip instead of a hundred.
 */
async function balanceSlot(token: Address, holder: Address): Promise<Hex | null> {
  const cacheKey = `${token.toLowerCase()}:${holder.toLowerCase()}`;
  if (slotCache.has(cacheKey)) return slotCache.get(cacheKey) ?? null;

  const slots = candidateSlots(holder);
  let found: Hex | null = null;
  try {
    const { data } = await verifyClient().call({
      to: token,
      data: encodeFunctionData({ abi: ERC20, functionName: "balanceOf", args: [holder] }),
      stateOverride: [
        {
          address: token,
          stateDiff: slots.map((slot, i) => ({ slot, value: pad(toHex(MARKER_BASE + BigInt(i))) })),
        },
      ],
    });
    if (data) {
      const index = BigInt(data) - MARKER_BASE;
      if (index >= 0n && index < BigInt(slots.length)) found = slots[Number(index)];
    }
  } catch {
    found = null;
  }
  slotCache.set(cacheKey, found);
  return found;
}

/* ─────────────────────────────── the simulation ─────────────────────────────── */

export type SimulationInput = {
  token: Address;
  kind: PoolKind;
  /** v2 pair or v3 pool address, or the v4 pool id. */
  poolId: string;
  /** v4 only. */
  key: PoolKey | null;
  dex: string;
  liquidityUsd: number | null;
  quotePriceUsd: number | null;
  tokenPriceUsd: number | null;
};

export type SimulationOutcome = SimulationSummary & {
  /** Why the run could not complete, when it could not. Diagnostic only. */
  failure: string | null;
  /** The simulation itself could not run, so nothing about selling is known. */
  inconclusive: boolean;
};

const pct = (lost: bigint, of: bigint): number =>
  of > 0n ? Number((lost * 1_000_000n) / of) / 10_000 : 0;

function units(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) return 0n;
  const precise = Math.min(decimals, 12);
  return BigInt(Math.floor(amount * 10 ** precise)) * 10n ** BigInt(decimals - precise);
}

function revertReason(data: Hex | undefined): string {
  if (!data || data === "0x") return "reverted without a reason";
  if (data.startsWith("0x08c379a0")) {
    try {
      const length = Number(BigInt(`0x${data.slice(74, 138)}`));
      return Buffer.from(data.slice(138, 138 + length * 2), "hex").toString("utf8");
    } catch {
      return data.slice(0, 10);
    }
  }
  return `custom error ${data.slice(0, 10)}`;
}

const inconclusive = (failure: string): SimulationOutcome => ({
  tradeUsd: null,
  roundTripPct: null,
  buyTaxPct: null,
  sellTaxPct: null,
  sellBlocked: false,
  sellOnly: false,
  failure,
  inconclusive: true,
});

export async function simulateRoundTrip(input: SimulationInput): Promise<SimulationOutcome> {
  const client = verifyClient();
  const { token, kind } = input;
  if (kind === "other") return inconclusive("pool type not supported");

  // Which asset the pool trades the token against, read from the pool itself.
  let quote: Address;
  if (kind === "v4") {
    if (!input.key) return inconclusive("pool key not found");
    quote = input.key.currency0.toLowerCase() === token.toLowerCase() ? input.key.currency1 : input.key.currency0;
  } else {
    const pool = input.poolId as Address;
    const [t0, t1] = await Promise.all([
      client.readContract({ address: pool, abi: ERC20, functionName: "token0" }),
      client.readContract({ address: pool, abi: ERC20, functionName: "token1" }),
    ]);
    quote = t0.toLowerCase() === token.toLowerCase() ? t1 : t0;
  }

  const quoteIsEth = quote === NATIVE || quote.toLowerCase() === WETH.toLowerCase();
  const quoteDecimals = quoteIsEth
    ? 18
    : await client.readContract({ address: quote, abi: ERC20, functionName: "decimals" });

  const tradeUsd = Math.max(
    0.5,
    Math.min(TRADE_USD, (input.liquidityUsd ?? TRADE_USD / MAX_SHARE_OF_LIQUIDITY) * MAX_SHARE_OF_LIQUIDITY),
  );

  const overrides: { address: Address; stateDiff: { slot: Hex; value: Hex }[] }[] = [];
  let amountIn = 0n;
  let sellOnly = false;

  if (quoteIsEth || input.quotePriceUsd) {
    amountIn = units(tradeUsd / (input.quotePriceUsd ?? 0), quoteDecimals);
  }

  if (!quoteIsEth) {
    // Fund the simulator with the quote asset, or fall back to selling only.
    const slot = amountIn > 0n ? await balanceSlot(quote, SIM) : null;
    if (slot) {
      overrides.push({ address: quote, stateDiff: [{ slot, value: pad(toHex(amountIn * 2n)) }] });
    } else {
      const tokenSlot = await balanceSlot(token, SIM);
      const tokenDecimals = await client.readContract({ address: token, abi: ERC20, functionName: "decimals" });
      const tokenAmount = units(tradeUsd / (input.tokenPriceUsd ?? 0), tokenDecimals);
      if (!tokenSlot || tokenAmount === 0n) return inconclusive("could not fund the simulation");
      overrides.push({ address: token, stateDiff: [{ slot: tokenSlot, value: pad(toHex(tokenAmount)) }] });
      amountIn = 0n;
      sellOnly = true;
    }
  }
  if (amountIn === 0n && !sellOnly) return inconclusive("no price to size the trade");

  const request = {
    kind: kind === "v4" ? 4 : kind === "v3" ? 3 : 2,
    pool: kind === "v4" ? V4_POOL_MANAGER : (input.poolId as Address),
    key: input.key ?? ZERO_KEY,
    token,
    quote: kind === "v4" ? quote : quote === NATIVE ? WETH : quote,
    weth: WETH,
    payWithNative: quoteIsEth,
    amountIn,
    v2FeeBps: input.dex.startsWith("pancakeswap") ? 25 : 30,
  } as const;

  let data: Hex | undefined;
  try {
    ({ data } = await client.call({
      account: CALLER,
      to: SIM,
      gas: GAS,
      data: encodeFunctionData({ abi: VERIFY_SIM_ABI, functionName: "simulate", args: [request] }),
      stateOverride: [
        { address: SIM, code: VERIFY_SIM_RUNTIME, balance: (quoteIsEth ? amountIn : 0n) + 10n ** 18n },
        ...overrides,
      ],
    }));
  } catch (e) {
    return inconclusive(e instanceof Error ? e.message.slice(0, 160) : "simulation call failed");
  }
  if (!data) return inconclusive("simulation returned nothing");

  const result = decodeFunctionResult({ abi: VERIFY_SIM_ABI, functionName: "simulate", data });
  const { buy, sell, sold } = result;

  if (!result.buySkipped && !buy.ok) {
    // We could not even buy. That is not evidence about selling either way.
    return inconclusive(`buy failed: ${revertReason(buy.err)}`);
  }
  if (sold === 0n) return inconclusive("the buy delivered no tokens");

  const summary: SimulationOutcome = {
    tradeUsd: sellOnly ? null : tradeUsd,
    roundTripPct: null,
    buyTaxPct: result.buySkipped ? null : pct(buy.quoted - buy.received, buy.quoted),
    sellTaxPct: null,
    sellBlocked: !sell.ok,
    sellOnly,
    failure: sell.ok ? null : `sell failed: ${revertReason(sell.err)}`,
    inconclusive: false,
  };

  if (sell.ok) {
    // On v2 the tax is what the pair actually received against what was sent.
    // On v3 and v4 a token that taxes transfers makes the sell revert instead,
    // so what is left to measure is any shortfall on the payout.
    summary.sellTaxPct =
      kind === "v2" ? pct(sold - sell.poolGot, sold) : pct(sell.quoted - sell.received, sell.quoted);
    if (!sellOnly && amountIn > 0n) summary.roundTripPct = pct(amountIn - sell.received, amountIn);
  }

  return summary;
}
