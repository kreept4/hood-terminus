import "server-only";
import { parseAbi, parseAbiItem, type Address, type Hex } from "viem";
import { verifyClient, V4_POOL_MANAGER } from "./client";
import { CONTRACTS } from "@/lib/chain/contracts";
import type { PoolKind } from "./types";

/**
 * How to trade through a pool, recovered from the chain.
 *
 * GeckoTerminal says which pool and which dex. It does not say how the pool is
 * built, and a simulation that guesses wrong reports a failed sell that would
 * have worked. So the shape is read from the contracts themselves.
 */

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

const INITIALIZE = parseAbiItem(
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
);

const PROBE_ABI = parseAbi([
  "function fee() view returns (uint24)",
  "function getReserves() view returns (uint112, uint112, uint32)",
]);

/** The RPC refuses log queries spanning more than ten million blocks. */
const LOG_WINDOW = 9_999_999n;

/** Pool keys never change once a pool exists, so they are cached for the life of the instance. */
const keyCache = new Map<string, PoolKey>();

/**
 * The v4 key for a pool id, read from its Initialize event.
 *
 * The search starts at the block the pool was probably created in, estimated
 * from GeckoTerminal's creation time, and widens from there. Most pools are
 * found in the first window, and a found key is never looked up again.
 */
export async function v4PoolKey(id: Hex, createdAt: string | null): Promise<PoolKey | null> {
  const cached = keyCache.get(id);
  if (cached) return cached;

  const client = verifyClient();
  const head = await client.getBlock();
  const windows: [bigint, bigint][] = [];

  if (createdAt) {
    // Blocks are roughly 100ms apart. The estimate only has to land the right
    // window, and a miss falls through to the full scan below.
    const ageSeconds = BigInt(Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 1000)));
    const guess = head.number - ageSeconds * 10n;
    const from = guess - LOG_WINDOW / 2n > 0n ? guess - LOG_WINDOW / 2n : 0n;
    windows.push([from, from + LOG_WINDOW < head.number ? from + LOG_WINDOW : head.number]);
  }
  for (let hi = head.number; hi > 0n; hi -= LOG_WINDOW + 1n) {
    windows.push([hi > LOG_WINDOW ? hi - LOG_WINDOW : 0n, hi]);
  }

  for (const [fromBlock, toBlock] of windows) {
    const logs = await client.getLogs({
      address: V4_POOL_MANAGER,
      event: INITIALIZE,
      args: { id },
      fromBlock,
      toBlock,
    });
    const log = logs[0];
    if (log?.args.currency0 !== undefined && log.args.currency1 !== undefined) {
      const key: PoolKey = {
        currency0: log.args.currency0,
        currency1: log.args.currency1,
        fee: Number(log.args.fee),
        tickSpacing: Number(log.args.tickSpacing),
        hooks: log.args.hooks as Address,
      };
      keyCache.set(id, key);
      return key;
    }
  }
  return null;
}

/** A 32-byte id is a v4 pool. Anything else is asked what it is. */
export async function poolKind(id: string): Promise<PoolKind> {
  if (/^0x[0-9a-fA-F]{64}$/.test(id)) return "v4";
  if (!/^0x[0-9a-fA-F]{40}$/.test(id)) return "other";

  const client = verifyClient();
  const address = id as Address;
  const [fee, reserves] = await Promise.allSettled([
    client.readContract({ address, abi: PROBE_ABI, functionName: "fee" }),
    client.readContract({ address, abi: PROBE_ABI, functionName: "getReserves" }),
  ]);
  if (fee.status === "fulfilled") return "v3";
  if (reserves.status === "fulfilled") return "v2";
  return "other";
}

/* ───────────────────────────── v4 hook permissions ───────────────────────────── */

/**
 * A v4 hook's permissions are written into the low 14 bits of its address, so
 * they can be read without calling it. Two matter to a trader: a hook that
 * returns a delta from a swap can change what you receive, and a pool with the
 * dynamic fee flag lets its hook set the fee on every trade.
 */
export const DYNAMIC_FEE_FLAG = 0x800000;

const BEFORE_SWAP = 1 << 7;
const AFTER_SWAP = 1 << 6;
const BEFORE_SWAP_RETURNS_DELTA = 1 << 3;
const AFTER_SWAP_RETURNS_DELTA = 1 << 2;

export type HookProfile = {
  present: boolean;
  touchesSwaps: boolean;
  /** The hook can take or add to the amounts of a swap. */
  changesSwapAmounts: boolean;
  dynamicFee: boolean;
};

export function hookProfile(key: PoolKey): HookProfile {
  const bits = Number(BigInt(key.hooks) & 0x3fffn);
  return {
    present: BigInt(key.hooks) !== 0n,
    touchesSwaps: (bits & (BEFORE_SWAP | AFTER_SWAP)) !== 0,
    changesSwapAmounts: (bits & (BEFORE_SWAP_RETURNS_DELTA | AFTER_SWAP_RETURNS_DELTA)) !== 0,
    dynamicFee: key.fee === DYNAMIC_FEE_FLAG,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */

const FACTORY = parseAbi([
  "function getPool(address,address,uint24) view returns (address)",
]);

const BALANCE = parseAbi(["function balanceOf(address) view returns (uint256)"]);

/** Uniswap v3's standard fee tiers, in hundredths of a basis point. */
const FEE_TIERS = [100, 500, 3000, 10_000] as const;

/**
 * The token's deepest pool, found on the chain instead of from a data provider.
 *
 * Verify used to locate the pool only through GeckoTerminal, which made the
 * whole feature a passenger of somebody else's uptime and coverage. When that
 * request failed the verdict was Unknown with "market data is unavailable",
 * and it said that about USDG against WETH, which is one of the most heavily
 * traded pairs on this chain. A tool that cannot check the obvious pairs is not
 * checking anything.
 *
 * The factory already knows. `getPool(token, quote, fee)` is a view call that
 * returns the pool for a pairing, so the set of candidates is four fee tiers
 * against each quote asset, and the right answer is whichever holds the most of
 * the quote. That is also the pool a real sell would route through, which is
 * the question Verify exists to answer.
 *
 * Used as a fallback rather than a replacement: when market data is available
 * it carries volume and price, which this cannot, and those feed other checks.
 */
export async function deepestPoolOnChain(
  token: Address,
  quotes: readonly Address[],
): Promise<Address | null> {
  const client = verifyClient();

  const candidates = quotes.flatMap((quote) =>
    FEE_TIERS.map((fee) => ({ quote, fee })),
  );

  const found = await Promise.all(
    candidates.map(async ({ quote, fee }) => {
      try {
        const pool = await client.readContract({
          address: CONTRACTS.v3Factory as Address,
          abi: FACTORY,
          functionName: "getPool",
          args: [token, quote, fee],
        });
        if (!pool || pool === ZERO_ADDRESS) return null;

        // Depth decides, because a pool that exists and holds nothing routes
        // nothing. Measured in the quote asset so tiers are comparable.
        const held = await client.readContract({
          address: quote,
          abi: BALANCE,
          functionName: "balanceOf",
          args: [pool],
        });
        return held > 0n ? { pool, held } : null;
      } catch {
        // One refused call should not lose the other seven.
        return null;
      }
    }),
  );

  const best = found
    .filter((x): x is { pool: Address; held: bigint } => x !== null)
    .sort((a, b) => (b.held > a.held ? 1 : b.held < a.held ? -1 : 0))[0];

  return best?.pool ?? null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
