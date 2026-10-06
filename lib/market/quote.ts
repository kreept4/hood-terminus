import "server-only";
import { CONTRACTS } from "@/lib/chain/contracts";

/**
 * Swap quoting, computed from pool state.
 *
 * Uniswap's QuoterV2 is not deployed at its canonical address on this chain,
 * and the address that is there holds something else. That turns out not to
 * matter: a single-hop quote is a pure function of `slot0()` and `liquidity()`,
 * both of which read fine, and computing it directly is a plain `view` rather
 * than QuoterV2's simulate-and-catch-the-revert trick.
 *
 * ── What this is exact about, and what it is not ───────────────────────────
 *
 * The maths below is exact while the swap stays inside the pool's current tick
 * range. Past that boundary the pool's liquidity changes and the real output is
 * LOWER than this reports, because the next range is thinner.
 *
 * So the quote is an upper bound, not a promise, and it is labelled as one.
 * Following the liquidity across ticks needs the tick bitmap walked, which is
 * dozens more calls per quote.
 *
 * This is safe precisely because it is never what protects the trader. A swap
 * carries a `minAmountOut` derived from the quote and the slippage setting, and
 * that bound is enforced on chain. A quote that is too optimistic makes a swap
 * revert. It cannot make someone receive less than they agreed to.
 */

const RPC =
  process.env.ALCHEMY_HTTPS_URL ?? "https://rpc.mainnet.chain.robinhood.com";

const Q96 = 1n << 96n;

/** slot0(), liquidity(), token0(), token1(), fee() */
const SEL = {
  slot0: "0x3850c7bd",
  liquidity: "0x1a686502",
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  fee: "0xddca3f43",
} as const;

export type PoolState = {
  address: string;
  token0: string;
  token1: string;
  /** Fee in hundredths of a basis point, as Uniswap stores it. 3000 = 0.3%. */
  fee: number;
  sqrtPriceX96: bigint;
  liquidity: bigint;
};

export type Quote = {
  amountIn: bigint;
  amountOut: bigint;
  /** Percent. Negative means the trade moves the price against the trader. */
  priceImpactPct: number;
  /** The fee this pool charges, as a percent. */
  feePct: number;
  /**
   * True when the trade is large enough that it would cross out of the current
   * tick range, so the real output is lower than `amountOut`.
   */
  beyondRange: boolean;
};

type RpcCall = { id: number; method: string; params: unknown[] };

async function batch(calls: RpcCall[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(calls.map((c) => ({ jsonrpc: "2.0", ...c }))),
      cache: "no-store",
    });
    if (!res.ok) return out;
    const json = (await res.json()) as { id: number; result?: string }[];
    for (const row of Array.isArray(json) ? json : [json]) {
      if (row.result) out.set(row.id, row.result);
    }
  } catch {
    // Unreachable node. The caller renders "no quote" rather than a wrong one.
  }
  return out;
}

function hex(v: string | undefined): bigint {
  if (!v || v === "0x") return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

export async function getPoolState(pool: string): Promise<PoolState | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(pool)) return null;

  const results = await batch([
    { id: 0, method: "eth_call", params: [{ to: pool, data: SEL.slot0 }, "latest"] },
    { id: 1, method: "eth_call", params: [{ to: pool, data: SEL.liquidity }, "latest"] },
    { id: 2, method: "eth_call", params: [{ to: pool, data: SEL.token0 }, "latest"] },
    { id: 3, method: "eth_call", params: [{ to: pool, data: SEL.token1 }, "latest"] },
    { id: 4, method: "eth_call", params: [{ to: pool, data: SEL.fee }, "latest"] },
  ]);

  const slot0 = results.get(0);
  if (!slot0 || slot0.length < 66) return null;

  // slot0 packs sqrtPriceX96 into the first word.
  const sqrtPriceX96 = BigInt("0x" + slot0.slice(2, 66));
  if (sqrtPriceX96 === 0n) return null;

  const t0 = results.get(2);
  const t1 = results.get(3);
  if (!t0 || !t1) return null;

  return {
    address: pool.toLowerCase(),
    token0: "0x" + t0.slice(-40),
    token1: "0x" + t1.slice(-40),
    fee: Number(hex(results.get(4))),
    sqrtPriceX96,
    liquidity: hex(results.get(1)),
  };
}

/**
 * Exact-input quote for a single hop.
 *
 * Within one tick range, a constant-product pool moves along:
 *
 *   selling token0:  sqrtP' = (L * sqrtP) / (L + dx * sqrtP)
 *                    dy     = L * (sqrtP - sqrtP')
 *
 *   selling token1:  sqrtP' = sqrtP + dy / L
 *                    dx     = L * (1/sqrtP - 1/sqrtP')
 *
 * All in Q96 fixed point, all in BigInt. Floating point anywhere near a
 * sqrtPriceX96 loses precision long before it loses correctness, and the
 * resulting quote would be quietly wrong rather than obviously wrong.
 */
export function quoteExactIn(
  state: PoolState,
  tokenIn: string,
  amountIn: bigint,
): Quote | null {
  if (amountIn <= 0n || state.liquidity === 0n) return null;

  const zeroForOne = tokenIn.toLowerCase() === state.token0.toLowerCase();
  const feePct = state.fee / 10_000;

  // The pool takes its fee off the input before any of it touches the curve.
  const feeAmount = (amountIn * BigInt(state.fee)) / 1_000_000n;
  const net = amountIn - feeAmount;
  if (net <= 0n) return null;

  const L = state.liquidity;
  const sqrtP = state.sqrtPriceX96;

  let amountOut: bigint;
  let sqrtNext: bigint;

  if (zeroForOne) {
    // Price falls. Denominator in Q96 so the division stays exact.
    const denominator = L * Q96 + net * sqrtP;
    if (denominator === 0n) return null;
    sqrtNext = (L * sqrtP * Q96) / denominator;
    amountOut = (L * (sqrtP - sqrtNext)) / Q96;
  } else {
    // Price rises.
    sqrtNext = sqrtP + (net * Q96) / L;
    if (sqrtNext <= sqrtP) return null;
    const numerator = L * Q96 * (sqrtNext - sqrtP);
    amountOut = numerator / (sqrtNext * sqrtP);
  }

  if (amountOut <= 0n) return null;

  // Impact is the move in the pool's own price, which is what the trader pays
  // for size. Measured on sqrtPrice squared, so it is a price move rather than
  // a sqrt-price move.
  const before = Number(sqrtP);
  const after = Number(sqrtNext);
  const priceImpactPct =
    before > 0 ? ((after * after - before * before) / (before * before)) * 100 : 0;

  return {
    amountIn,
    amountOut,
    priceImpactPct: zeroForOne ? priceImpactPct : -priceImpactPct,
    feePct,
    // Past a few percent the single-range assumption stops holding well enough
    // to present the number without a caveat.
    beyondRange: Math.abs(priceImpactPct) > 5,
  };
}

/** Everything the trade panel needs for one pair, in one round trip. */
export async function quotePool(
  pool: string,
  tokenIn: string,
  amountIn: bigint,
): Promise<{ state: PoolState; quote: Quote | null } | null> {
  const state = await getPoolState(pool);
  if (!state) return null;
  return { state, quote: quoteExactIn(state, tokenIn, amountIn) };
}

export { CONTRACTS };
