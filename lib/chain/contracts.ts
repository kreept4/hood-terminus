/**
 * On-chain contract addresses for Robinhood Chain, 4663.
 *
 * Every address here was read off the chain and cross-checked, never assumed
 * from what the same contract is deployed at elsewhere. That distinction turned
 * out to matter: the canonical Uniswap V3 Factory address holds something else
 * entirely on this chain, and using it would have failed silently.
 *
 * How these were found, for the next person:
 *
 *   1. Take any live pool address from market data.
 *   2. Call `factory()` on it. A pool names its own factory, so the factory
 *      cannot be wrong if the pool is real.
 *   3. Call `token0()` and `token1()` on the same pool, then `symbol()` on
 *      each. A WETH-quoted pool hands you the chain's WETH address.
 *   4. Prove it round-trips: `factory.getPool(token0, token1, fee)` must return
 *      the pool you started from. If it does, every address in the chain of
 *      reasoning is confirmed by the others.
 *
 * Verified 2026-09-05 against a live USDG/WETH pool.
 */

/** Confirmed by reading the chain, with the method above. */
export const CONTRACTS = {
  /**
   * Uniswap V3 Factory. 24,536 bytes.
   *
   * NOT at the canonical 0x1f98431c… address, which on this chain holds a
   * 2,110-byte contract that is something else. Proven by round-trip:
   * `getPool(WETH, USDG, 100)` returns the pool this was read from.
   */
  v3Factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",

  /**
   * Wrapped ETH. `symbol()` and `name()` both return "WETH".
   *
   * Not at the OP-stack predeploy address, as expected for an Orbit chain.
   */
  weth: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",

  /** Uniswap's UniversalRouter. 19,500 bytes, at the canonical address. */
  universalRouter: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",

  /** Permit2. 9,153 bytes, matching the canonical deployment exactly. */
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
} as const;

/**
 * The chain runs several exchanges, and V3 is only one of them.
 *
 * An earlier note here concluded "V3, not V4" from a single pool answering the
 * V3 interface. That was too small a sample. Market data lists at least eight
 * exchanges on 4663: Uniswap V3 and V4, Pons, Bankr, Ramses and others, with
 * Pons carrying the most pools of any of them.
 *
 * The addresses above are Uniswap V3's, and the quote engine reads the V3 pool
 * interface, so only V3 and its forks are routable here. `ROUTABLE_DEXES` in
 * `lib/market/gecko.ts` is where that is enforced.
 *
 * Supporting V4 is a separate build: its pools are positions inside a singleton
 * PoolManager rather than contracts of their own, so none of this reaches them.
 */
export const ROUTED_AMM = "uniswap-v3" as const;

/**
 * Addresses at their canonical slots that are NOT what the name says.
 *
 * Both hold exactly 2,110 bytes. Calling either as if it were Uniswap would
 * revert at best and misbehave at worst. Listed so nobody rediscovers them.
 */
export const DECOYS = {
  notV3Factory: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
  notV3QuoterV2: "0x61ffe014ba17989e743c5f6cb21bf9697530b21e",
} as const;

/**
 * Quoting does not need a Quoter contract.
 *
 * QuoterV2 is not deployed at its canonical address here, but a quote for a
 * single-hop swap is a pure function of pool state, and `slot0()` and
 * `liquidity()` both read fine. Computing from state is also a `view` rather
 * than QuoterV2's revert-and-catch trick, so it is cheaper and simpler.
 */
export const QUOTE_FROM_POOL_STATE = true;

/** Everything trading needs is now known. */
export function canTrade(): boolean {
  return true;
}
