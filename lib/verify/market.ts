import "server-only";
import type { Address } from "viem";

/**
 * What GeckoTerminal knows about a token and its pools.
 *
 * Verify reads two endpoints: token info, for holder distribution and
 * GeckoTerminal's own honeypot flag, and token pools, to find the pool most
 * people would actually trade through. Both are cached for a minute, because
 * the free tier's budget is shared with the rest of the product.
 *
 * Nothing here is trusted on its own. The honeypot flag is a second opinion
 * next to our own simulation, and the pool list only decides where to run it.
 */

const BASE = "https://api.geckoterminal.com/api/v2/networks/robinhood";

type Json = Record<string, unknown>;

/**
 * One GET with a single retry on a rate limit. Returns null when the data could
 * not be fetched, which callers must treat as "unknown", never as "empty".
 */
async function gecko(path: string): Promise<Json | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { accept: "application/json" },
        next: { revalidate: 60 },
      });
      if (res.status === 429 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1_500));
        continue;
      }
      if (!res.ok) return null;
      return (await res.json()) as Json;
    } catch {
      return null;
    }
  }
  return null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const addressOf = (id: unknown): Address | null =>
  typeof id === "string" && id.includes("_0x")
    ? (id.slice(id.indexOf("_") + 1) as Address)
    : null;

export type TokenInfo = {
  name: string | null;
  symbol: string | null;
  holderCount: number | null;
  top10Pct: number | null;
  developer: Address | null;
  developerPct: number | null;
  geckoHoneypot: boolean | null;
};

export async function tokenInfo(token: Address): Promise<TokenInfo | null> {
  const body = await gecko(`/tokens/${token}/info`);
  const a = (body?.data as Json | undefined)?.attributes as Json | undefined;
  if (!a) return null;
  const holders = a.holders as Json | undefined;
  const dist = holders?.distribution_percentage as Json | undefined;
  return {
    name: typeof a.name === "string" ? a.name : null,
    symbol: typeof a.symbol === "string" ? a.symbol : null,
    holderCount: num(holders?.count),
    top10Pct: num(dist?.top_10),
    developer: typeof a.developer_address === "string" ? (a.developer_address as Address) : null,
    developerPct: num(a.developer_holding_percentage),
    geckoHoneypot: typeof a.is_honeypot === "boolean" ? a.is_honeypot : null,
  };
}

export type MarketPool = {
  id: string;
  dex: string;
  name: string;
  liquidityUsd: number | null;
  createdAt: string | null;
  feePct: number | null;
  /** The side of the pool that is not the token being checked. */
  quote: Address;
  quoteSymbol: string;
  quoteDecimals: number | null;
  quotePriceUsd: number | null;
  tokenPriceUsd: number | null;
  tokenDecimals: number | null;
  buys24h: number | null;
  sells24h: number | null;
};

/**
 * The token's pools, deepest first. Null means the market data could not be
 * fetched; an empty list means it was fetched and the token has no pools.
 */
export async function tokenPools(token: Address): Promise<MarketPool[] | null> {
  const body = await gecko(`/tokens/${token}/pools?include=base_token,quote_token&page=1`);
  if (!body) return null;
  const data = (body.data as Json[] | undefined) ?? [];
  const included = new Map<string, Json>();
  for (const item of (body.included as Json[] | undefined) ?? []) {
    if (typeof item.id === "string") included.set(item.id, (item.attributes as Json) ?? {});
  }

  const lower = token.toLowerCase();
  const pools: MarketPool[] = [];

  for (const p of data) {
    const a = (p.attributes as Json) ?? {};
    const rel = (p.relationships as Json) ?? {};
    const baseId = ((rel.base_token as Json)?.data as Json)?.id;
    const quoteId = ((rel.quote_token as Json)?.data as Json)?.id;
    const dexId = ((rel.dex as Json)?.data as Json)?.id;
    const base = addressOf(baseId);
    const quote = addressOf(quoteId);
    if (!base || !quote) continue;

    const tokenIsBase = base.toLowerCase() === lower;
    const other = tokenIsBase ? quote : base;
    const otherAttrs = included.get(String(tokenIsBase ? quoteId : baseId)) ?? {};
    const tokenAttrs = included.get(String(tokenIsBase ? baseId : quoteId)) ?? {};
    const tx = ((a.transactions as Json)?.h24 as Json) ?? {};

    pools.push({
      id: String(a.address ?? ""),
      dex: typeof dexId === "string" ? dexId : "unknown",
      name: String(a.name ?? ""),
      liquidityUsd: num(a.reserve_in_usd),
      createdAt: typeof a.pool_created_at === "string" ? a.pool_created_at : null,
      feePct: num(a.pool_fee_percentage),
      quote: other,
      quoteSymbol: String(otherAttrs.symbol ?? "?"),
      quoteDecimals: num(otherAttrs.decimals),
      quotePriceUsd: num(tokenIsBase ? a.quote_token_price_usd : a.base_token_price_usd),
      tokenPriceUsd: num(tokenIsBase ? a.base_token_price_usd : a.quote_token_price_usd),
      tokenDecimals: num(tokenAttrs.decimals),
      buys24h: num(tx.buys),
      sells24h: num(tx.sells),
    });
  }

  return pools.sort((x, y) => (y.liquidityUsd ?? 0) - (x.liquidityUsd ?? 0));
}

// The table and the naming live in ./venue, which carries no server boundary,
// so a page or a test can name an exchange without pulling this module in.
export { LAUNCHPAD_DEXES } from "./venue";

