import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { robinhoodChain } from "@/lib/chain";

/**
 * Verify's chain client.
 *
 * Same RPC precedence as the rest of the server code: Alchemy when configured,
 * the public endpoint otherwise. The public endpoint rate limits hard, so
 * retries are on with a delay long enough to clear a 429.
 */

const RPC =
  process.env.ALCHEMY_HTTPS_URL ?? "https://rpc.mainnet.chain.robinhood.com";

let client: PublicClient | null = null;

export function verifyClient(): PublicClient {
  client ??= createPublicClient({
    chain: robinhoodChain,
    transport: http(RPC, { retryCount: 4, retryDelay: 800, timeout: 15_000 }),
  }) as PublicClient;
  return client;
}

/**
 * Uniswap v4 PoolManager on Robinhood Chain.
 *
 * Found by reading the chain, not assumed: it is the only contract emitting the
 * v4 `Swap` event, and the Initialize events for Uniswap, Pons and Bankr pools
 * all come from it. Verified 2026-10-06.
 */
export const V4_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951" as const;

/** Wrapped ETH, read off a live WETH-quoted v3 pool. Verified 2026-10-06. */
export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as const;

/** v4 marks native ETH as the zero address. */
export const NATIVE = "0x0000000000000000000000000000000000000000" as const;
