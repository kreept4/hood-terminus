import "server-only";
import {
  getNewPools,
  getTopPools,
  getTrendingPools,
  getTokenImages,
} from "@/lib/market/gecko";
import { getLaunchpadArtwork } from "@/lib/launchpad/artwork";

/**
 * Wallet holdings, read straight from the chain.
 *
 * The obvious route is an explorer's address endpoint, which enumerates every
 * token a wallet has ever touched. Blockscout sits behind a bot challenge that
 * refuses server requests, so this reads balances itself.
 *
 * That means the universe has to be bounded, and it is bounded by the tracked
 * pools: every base token with a live market on this chain. A wallet holding
 * something with no market would not have a price to value it at anyway, so
 * the bound costs nothing a portfolio could have shown.
 *
 * Balances and decimals come back in batched JSON-RPC, chunked so a single
 * request never carries more calls than the node will answer at once.
 */

const RPC =
  process.env.ALCHEMY_HTTPS_URL ?? "https://rpc.mainnet.chain.robinhood.com";

/** balanceOf(address) and decimals(), as selectors. */
const BALANCE_OF = "0x70a08231";
const DECIMALS = "0x313ce567";

/** Calls per request. Large enough to be one round trip, small enough to land. */
const CHUNK = 50;

export type Holding = {
  address: string;
  symbol: string;
  /** Human-readable amount. */
  amount: number;
  priceUsd: number | null;
  valueUsd: number | null;
  /** Where to send someone who taps it. */
  poolAddress: string | null;
  change24h: number | null;
  /** The token's own artwork, when it has any. */
  imageUrl: string | null;
  /** True for the chain's own gas token, which has no contract. */
  native: boolean;
};

export type Portfolio = {
  holdings: Holding[];
  totalUsd: number;
  /** Value in tokens that have a market, as opposed to the gas token. */
  tokensUsd: number;
  nativeUsd: number;
  reachable: boolean;
};

type RpcResponse = { id: number; result?: string; error?: unknown };

async function batch(
  calls: { id: number; method: string; params: unknown[] }[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();

  for (let i = 0; i < calls.length; i += CHUNK) {
    const slice = calls.slice(i, i + CHUNK);
    try {
      const res = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          slice.map((c) => ({ jsonrpc: "2.0", ...c })),
        ),
        cache: "no-store",
      });
      if (!res.ok) continue;

      const json = (await res.json()) as RpcResponse[] | RpcResponse;
      const rows = Array.isArray(json) ? json : [json];
      for (const row of rows) {
        // A reverted call is normal here: not every address in the universe
        // implements every method. It simply has no result.
        if (row.result && !row.error) out.set(row.id, row.result);
      }
    } catch {
      // Node unreachable for this chunk. The caller renders what it has.
    }
  }

  return out;
}

function hexToBigInt(hex: string | undefined): bigint {
  if (!hex || hex === "0x") return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

export async function getPortfolio(wallet: string): Promise<Portfolio> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return {
      holdings: [],
      totalUsd: 0,
      tokensUsd: 0,
      nativeUsd: 0,
      reachable: false,
    };
  }

  const [top, fresh, trending] = await Promise.all([
    getTopPools(),
    getNewPools(),
    getTrendingPools(),
  ]);

  // One entry per token, keeping whichever pool reports the deepest liquidity.
  // A token with three pools should be priced by its real market, not by
  // whichever happened to be first in the list.
  type Entry = {
    symbol: string;
    priceUsd: number | null;
    change24h: number | null;
    poolAddress: string;
    liquidityUsd: number;
  };
  const universe = new Map<string, Entry>();

  for (const p of [...top, ...trending, ...fresh]) {
    const token = p.baseTokenAddress?.toLowerCase();
    if (!token) continue;
    const liquidity = p.liquidityUsd ?? 0;
    const held = universe.get(token);
    if (held && held.liquidityUsd >= liquidity) continue;
    universe.set(token, {
      symbol: p.symbol,
      priceUsd: p.priceUsd,
      change24h: p.change24h,
      poolAddress: p.address,
      liquidityUsd: liquidity,
    });
  }

  const tokens = [...universe.keys()];
  const padded = wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0");

  // Native balance, then one balanceOf per token.
  const calls: { id: number; method: string; params: unknown[] }[] = [
    { id: 0, method: "eth_getBalance", params: [wallet, "latest"] },
  ];
  tokens.forEach((token, i) => {
    calls.push({
      id: i + 1,
      method: "eth_call",
      params: [{ to: token, data: BALANCE_OF + padded }, "latest"],
    });
  });

  const balances = await batch(calls);
  if (balances.size === 0) {
    return {
      holdings: [],
      totalUsd: 0,
      tokensUsd: 0,
      nativeUsd: 0,
      reachable: false,
    };
  }

  // Decimals only for the tokens actually held. Asking for all of them would
  // double the request count to answer a question about balances that are zero.
  const heldIndexes = tokens
    .map((_, i) => i)
    .filter((i) => hexToBigInt(balances.get(i + 1)) > 0n);

  const decimalCalls = heldIndexes.map((i) => ({
    id: i,
    method: "eth_call",
    params: [{ to: tokens[i], data: DECIMALS }, "latest"],
  }));
  const decimals = await batch(decimalCalls);

  const holdings: Holding[] = [];

  for (const i of heldIndexes) {
    const token = tokens[i];
    const meta = universe.get(token)!;
    const raw = hexToBigInt(balances.get(i + 1));
    // Eighteen is the ERC-20 default and what a token that does not answer
    // `decimals()` almost certainly uses.
    const d = Number(hexToBigInt(decimals.get(i))) || 18;
    const amount = Number(raw) / 10 ** d;
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const valueUsd = meta.priceUsd === null ? null : amount * meta.priceUsd;

    holdings.push({
      address: token,
      symbol: meta.symbol,
      amount,
      priceUsd: meta.priceUsd,
      valueUsd,
      poolAddress: meta.poolAddress,
      change24h: meta.change24h,
      imageUrl: null,
      native: false,
    });
  }

  // The gas token. Priced off any pool quoting against WETH, since the chain's
  // native asset is ETH.
  const nativeRaw = hexToBigInt(balances.get(0));
  const nativeAmount = Number(nativeRaw) / 1e18;
  const ethPrice = ethPriceFrom(top);

  if (nativeAmount > 0) {
    holdings.push({
      address: "native",
      symbol: "ETH",
      amount: nativeAmount,
      priceUsd: ethPrice,
      valueUsd: ethPrice === null ? null : nativeAmount * ethPrice,
      poolAddress: null,
      change24h: null,
      imageUrl: null,
      native: true,
    });
  }

  // Artwork last, and only for what is actually held. Fetching it for the
  // whole universe would be dozens of requests to decorate rows nobody has.
  //
  // Two sources, in order of who knows better. The market feed has artwork for
  // tokens that have been listed, which is nothing launched here in the last
  // day and no launchpad token at all. Our own table has whatever the creator
  // uploaded, which for a token launched on this site is the only picture that
  // exists anywhere. So the creator's own upload wins.
  const erc20 = holdings.filter((h) => !h.native).map((h) => h.address);
  const [feed, uploaded] = await Promise.all([
    getTokenImages(erc20),
    getLaunchpadArtwork(erc20),
  ]);
  for (const h of holdings) {
    h.imageUrl =
      uploaded.get(h.address)?.imageUrl ?? feed.get(h.address) ?? null;
  }

  holdings.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  const tokensUsd = holdings
    .filter((h) => !h.native)
    .reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
  const nativeUsd = holdings
    .filter((h) => h.native)
    .reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);

  return {
    holdings,
    totalUsd: tokensUsd + nativeUsd,
    tokensUsd,
    nativeUsd,
    reachable: true,
  };
}

/**
 * The dollar price of ETH, taken from a pool that quotes against it.
 *
 * GeckoTerminal reports the base token's price, so a pool whose base is WETH
 * gives ETH directly. Whichever such pool is deepest is the least noisy source.
 */
function ethPriceFrom(pools: { symbol: string; priceUsd: number | null; liquidityUsd: number | null }[]) {
  let best: { price: number; liquidity: number } | null = null;

  for (const p of pools) {
    if (p.symbol !== "WETH" && p.symbol !== "ETH") continue;
    if (p.priceUsd === null) continue;
    const liquidity = p.liquidityUsd ?? 0;
    if (!best || liquidity > best.liquidity) {
      best = { price: p.priceUsd, liquidity };
    }
  }

  return best?.price ?? null;
}
