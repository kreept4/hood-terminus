import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { robinhoodChain } from "@/lib/chain";
import { CONTRACTS } from "@/lib/chain/contracts";

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

/**
 * Wrapped ETH, from the one place the app records chain addresses.
 *
 * This was a second literal of the same address, which is how two copies of a
 * contract address end up disagreeing after one of them is corrected. There is
 * nothing special about Verify's need for it, so it reads the shared record,
 * which carries the proof of how the address was established.
 *
 * Re-exported rather than removed because `simulate.ts` imports it from here,
 * and it only ever compares it case-insensitively or passes it as a call
 * argument, so the checksum casing this used to carry was never load-bearing.
 */
export const WETH = CONTRACTS.weth;

/** v4 marks native ETH as the zero address. */
export const NATIVE = "0x0000000000000000000000000000000000000000" as const;
