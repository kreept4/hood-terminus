import "server-only";
import { CHAIN_ID } from "./index";

/**
 * Live chain reads for server components.
 *
 * Server-side only, and now enforced rather than promised. The Alchemy URL
 * contains an API key, and `server-only` turns a careless import from a client
 * component into a build error instead of a key in a public bundle.
 *
 * These are the only figures the product can state truthfully before the
 * indexer exists. Everything else on the page still says so.
 */

type RpcOk<T> = { result: T };
type RpcErr = { error: { message: string } };

async function rpc<T>(
  method: string,
  params: unknown[] = [],
  revalidateSeconds = 5,
): Promise<T | null> {
  // Alchemy when we have it. The public endpoint otherwise: heavily rate
  // limited and unfit for the indexer, but it keeps a deployment honest
  // rather than showing "unreachable" for want of an env var.
  const url =
    process.env.ALCHEMY_HTTPS_URL ?? "https://rpc.mainnet.chain.robinhood.com";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
      // Cached across requests: a head block that is a few seconds old is
      // still true, and this endpoint is metered.
      next: { revalidate: revalidateSeconds },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as RpcOk<T> | RpcErr;
    if ("error" in json) return null;
    return json.result;
  } catch {
    // The chain being unreachable is a normal state, not an exception. The
    // caller renders "unavailable" rather than an error page.
    return null;
  }
}

export type ChainStatus = {
  chainId: number;
  headBlock: number | null;
  reachable: boolean;
};

export async function getChainStatus(): Promise<ChainStatus> {
  const hex = await rpc<string>("eth_blockNumber");
  const headBlock = hex ? parseInt(hex, 16) : null;

  return {
    chainId: CHAIN_ID,
    headBlock: Number.isFinite(headBlock) ? headBlock : null,
    reachable: headBlock !== null,
  };
}

export type GasReading = {
  /** Wei per gas unit. */
  weiPerGas: number | null;
  /** The same figure in gwei, which is how gas is spoken about. */
  gwei: number | null;
  /** What a plain ETH transfer costs at this price, in ETH. */
  transferEth: number | null;
  /** What a token swap costs at this price, in ETH. */
  swapEth: number | null;
  reachable: boolean;
};

/** A transfer is 21,000 gas. A Uniswap swap is nearer 150,000 in practice. */
const TRANSFER_GAS = 21_000;
const SWAP_GAS = 150_000;

/**
 * Current gas price.
 *
 * Reported in gwei and, more usefully, as what two real actions cost. Gwei is
 * a unit almost nobody converts in their head, and the question behind the
 * question is always "what will this transaction cost me".
 *
 * Cached for two seconds. Robinhood Chain produces blocks about every 100ms,
 * so a fresh read per request would be a read per visitor for a number that
 * barely moves on an L2 with no fee market to speak of.
 */
export async function getGas(): Promise<GasReading> {
  const hex = await rpc<string>("eth_gasPrice", [], 2);
  const wei = hex ? parseInt(hex, 16) : null;

  if (wei === null || !Number.isFinite(wei)) {
    return {
      weiPerGas: null,
      gwei: null,
      transferEth: null,
      swapEth: null,
      reachable: false,
    };
  }

  return {
    weiPerGas: wei,
    gwei: wei / 1e9,
    transferEth: (wei * TRANSFER_GAS) / 1e18,
    swapEth: (wei * SWAP_GAS) / 1e18,
    reachable: true,
  };
}
