import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Our own pool directory, read back.
 *
 * The market data provider serves a hundred pools before it refuses. The
 * factory has emitted well over three thousand. This reads the index we built
 * from the factory, so search and the token count describe the chain rather
 * than describing somebody else's free tier.
 *
 * What it does not hold is price, volume or liquidity. Those still come from
 * the provider for the pools on screen, which is the part it is actually good
 * at. The point of this index is that the provider stops being the ceiling on
 * what can be found, not that it stops being useful.
 */

export type IndexedPool = {
  address: string;
  token0: string;
  token1: string;
  fee: number;
  createdBlock: number;
  token0Symbol: string | null;
  token1Symbol: string | null;
};

type Row = {
  address: string;
  token0: string;
  token1: string;
  fee: number;
  created_block: number;
  token0_symbol: string | null;
  token1_symbol: string | null;
};

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function toPool(r: Row): IndexedPool {
  return {
    address: r.address,
    token0: r.token0,
    token1: r.token1,
    fee: r.fee,
    createdBlock: r.created_block,
    token0Symbol: r.token0_symbol,
    token1Symbol: r.token1_symbol,
  };
}

const COLUMNS =
  "address,token0,token1,fee,created_block,token0_symbol,token1_symbol";

/**
 * How many pools we know about.
 *
 * Worth showing because it is the honest size of the market, and because it is
 * the number a visitor uses to decide whether this site knows the chain. Null
 * when the index has not been built, so a caller can say nothing rather than
 * say zero.
 */
export async function indexedPoolCount(): Promise<number | null> {
  const client = db();
  if (!client) return null;
  const { count, error } = await client
    .from("pools")
    .select("address", { count: "exact", head: true });
  return error ? null : (count ?? null);
}

/**
 * Finds pools by ticker or address across the whole index.
 *
 * Matched on either side of the pair, because a pair is named by either of its
 * tokens and somebody searching CASHCAT does not know or care which side it
 * landed on.
 */
export async function searchIndexedPools(
  query: string,
  limit = 50,
): Promise<IndexedPool[]> {
  const client = db();
  const q = query.trim();
  if (!client || q === "") return [];

  // An address is looked up exactly, on any of the three columns it could be.
  if (/^0x[0-9a-fA-F]{6,40}$/.test(q)) {
    const needle = q.toLowerCase();
    const { data, error } = await client
      .from("pools")
      .select(COLUMNS)
      .or(`address.like.${needle}%,token0.like.${needle}%,token1.like.${needle}%`)
      .limit(limit);
    return error || !data ? [] : (data as Row[]).map(toPool);
  }

  /**
   * Reduced to the characters a ticker is actually made of before it is spliced
   * into the filter string.
   *
   * `.or()` takes a raw PostgREST expression, not a bound parameter: the value
   * sits inside `token0_symbol.ilike.%…%` as text, and the grammar around it is
   * built from commas, dots and parentheses. A search term carrying any of
   * those is read as filter syntax rather than as something to match, which let
   * a crafted query rewrite the condition. It could only ever reach this one
   * public table and it failed to an empty result rather than leaking anything,
   * but a search box is not a place to be parsing attacker punctuation at all.
   *
   * Tickers are alphanumeric with the odd dot or dash, so nothing legitimate is
   * lost by keeping exactly that set and dropping the rest. Length is capped
   * because an ilike pattern is work, and an empty needle after stripping means
   * there is nothing to search for.
   */
  const needle = q.replace(/[^a-zA-Z0-9 ._-]/g, "").slice(0, 64);
  if (needle === "") return [];

  const { data, error } = await client
    .from("pools")
    .select(COLUMNS)
    .or(`token0_symbol.ilike.%${needle}%,token1_symbol.ilike.%${needle}%`)
    .order("created_block", { ascending: false })
    .limit(limit);

  return error || !data ? [] : (data as Row[]).map(toPool);
}

/** The most recently created pools, newest first. */
export async function newestIndexedPools(limit = 50): Promise<IndexedPool[]> {
  const client = db();
  if (!client) return [];
  const { data, error } = await client
    .from("pools")
    .select(COLUMNS)
    .order("created_block", { ascending: false })
    .limit(limit);
  return error || !data ? [] : (data as Row[]).map(toPool);
}
