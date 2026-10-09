import { createClient } from "@supabase/supabase-js";

/**
 * Read-only Supabase client for public, derived tables. Uses the anon key,
 * which is safe from a server component: RLS and the explicit grants in the
 * migrations are what protect the data, not the key being secret.
 *
 * Server-side only: not imported from a "use client" module.
 */
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: { persistSession: false },
  });
}

export type WalletRanking = {
  walletAddress: string;
  tradeCount: number;
  poolCount: number;
  lastActiveBlock: number | null;
  updatedAt: string;
};

/**
 * What it takes to appear in the ranking at all.
 *
 * The list is meant to be meme traders, not addresses that happen to be busy.
 * Being active on chain is not the same thing: a bridge relayer, an MEV bot
 * sweeping arbitrage, or a treasury moving funds will all out-transact a real
 * trader and tell a reader nothing about whether to follow them.
 *
 * So the floor is about the shape of the activity rather than its volume. A
 * wallet has to have traded several distinct pools, because one pool is a
 * holder rather than a trader, and it has to have been active recently, because
 * a wallet that stopped a month ago is not worth following now.
 *
 * These are applied in the query rather than in the UI, so every surface that
 * reads a ranking gets the same population.
 */
export const QUALIFY = {
  /** Fewer trades than this over the window is noise, not a track record. */
  minTrades: 8,
  /** One or two pools is a holder. Several is someone who trades launches. */
  minPools: 3,
  /** Above this over seven days is a bot, not a person. */
  maxTrades: 4_000,
} as const;

export type WalletSwap = {
  blockNumber: number;
  txHash: string;
  poolAddress: string;
  createdAt: string;
};

/**
 * Top wallets over the rolling 7-day window the rollup function maintains,
 * filtered to the population described by QUALIFY.
 *
 * This is an activity ranking over DEX swaps in tracked pools. Win rate and
 * realised profit are not computed: that needs a FIFO position engine on top of
 * raw swaps, which does not exist yet. Until it does, this page says so rather
 * than dressing trade counts up as performance.
 */
export async function getTopWallets(limit = 50): Promise<WalletRanking[]> {
  const supabase = client();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("wallet_rankings")
    .select("wallet_address, trade_count, pool_count, last_active_block, updated_at")
    .gte("trade_count", QUALIFY.minTrades)
    .lte("trade_count", QUALIFY.maxTrades)
    .gte("pool_count", QUALIFY.minPools)
    .order("trade_count", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[wallets] getTopWallets error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    walletAddress: row.wallet_address,
    tradeCount: row.trade_count,
    poolCount: row.pool_count,
    lastActiveBlock: row.last_active_block,
    updatedAt: row.updated_at,
  }));
}

/**
 * Single wallet's ranking row. Null if the wallet has no swaps in the
 * current 7-day window (may still exist historically once retention grows).
 */
export async function getWalletRanking(address: string): Promise<WalletRanking | null> {
  const supabase = client();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("wallet_rankings")
    .select("wallet_address, trade_count, pool_count, last_active_block, updated_at")
    .eq("wallet_address", address.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("[wallets] getWalletRanking error:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    walletAddress: data.wallet_address,
    tradeCount: data.trade_count,
    poolCount: data.pool_count,
    lastActiveBlock: data.last_active_block,
    updatedAt: data.updated_at,
  };
}

/**
 * Most recent swaps for one wallet, newest first. Pulls straight from the raw
 * swaps table, with no aggregation and no derived numbers.
 */
export async function getWalletRecentSwaps(
  address: string,
  limit = 30,
): Promise<WalletSwap[]> {
  const supabase = client();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("swaps")
    .select("block_number, tx_hash, pool_address, created_at")
    .eq("wallet_address", address.toLowerCase())
    .order("block_number", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[wallets] getWalletRecentSwaps error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    blockNumber: row.block_number,
    txHash: row.tx_hash,
    poolAddress: row.pool_address,
    createdAt: row.created_at,
  }));
}

export type WalletPnl = {
  walletAddress: string;
  wins: number;
  losses: number;
  winRatePct: number;
  realisedEth: number;
  tradeCount: number;
  poolCount: number;
  bestPct: number | null;
  worstPct: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  /** Average ETH per closed position. The number that outs a bot. */
  avgPerPosition: number;
  /**
   * Trades like a machine rather than a person.
   *
   * Excluded from the board entirely rather than flagged on it. The board
   * exists to answer one question, "who is worth copying", and the answer for
   * every one of these is no: the edge is latency, and a copier is late by
   * definition. Leaving them visible with a label meant the top of a
   * leaderboard was mostly wallets nobody should follow.
   *
   * Three shapes get caught:
   *
   *   arbitrage      a near-perfect record over many positions, each worth a
   *                  rounding error
   *   market making  both sides of the same market constantly, huge trade
   *                  count against few closed positions
   *   sniping        very high frequency across many tokens with almost no
   *                  hold time, which shows up as trades far exceeding
   *                  positions
   */
  likelyBot: boolean;
};

export type PnlSort = "realised" | "winRate" | "activity";

/**
 * One `wallet_pnl` row, mapped.
 *
 * Shared so a single wallet's page and the board cannot disagree about what a
 * win rate is. They did: the page carried its own "not computed" placeholders
 * while the board had the figures all along.
 */
function toWalletPnl(r: {
  wallet_address: string;
  wins: number;
  losses: number;
  win_rate_pct: number | string;
  realised_quote: number | string;
  trade_count: number;
  pool_count: number;
  best_pct: number | string | null;
  worst_pct: number | string | null;
  window_start: string | null;
  window_end: string | null;
}): WalletPnl {
  const closed = r.wins + r.losses;
  const avg = closed > 0 ? Number(r.realised_quote) / closed : 0;
  return {
    walletAddress: r.wallet_address,
    wins: r.wins,
    losses: r.losses,
    winRatePct: Number(r.win_rate_pct),
    realisedEth: Number(r.realised_quote),
    tradeCount: r.trade_count,
    poolCount: r.pool_count,
    bestPct: r.best_pct === null ? null : Number(r.best_pct),
    worstPct: r.worst_pct === null ? null : Number(r.worst_pct),
    windowStart: r.window_start,
    windowEnd: r.window_end,
    avgPerPosition: avg,
    likelyBot:
      // Arbitrage: near-perfect, many positions, each worth nothing.
      (Number(r.win_rate_pct) >= 90 && closed >= 20 && Math.abs(avg) < 0.002) ||
      // Market making and sniping: enormous trade counts against very few
      // closed positions. A person cannot place four hundred trades and
      // close eight of them.
      (r.trade_count >= 200 && r.trade_count > closed * 15) ||
      // Spread across more markets than anyone reads in a week.
      r.pool_count >= 60,
  };
}

/**
 * One wallet's scored record, for its own page.
 *
 * Unlike `getWalletPnl` this applies no minimum and no bot exclusion. Those
 * filters exist to keep the board worth reading; on a page someone navigated to
 * deliberately, withholding the numbers would just look broken. `likelyBot`
 * still comes back so the page can say so.
 */
export async function getWalletPnlFor(address: string): Promise<WalletPnl | null> {
  const supabase = client();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("wallet_pnl")
    .select("*")
    .eq("wallet_address", address.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("[wallets] getWalletPnlFor error:", error.message);
    return null;
  }

  return data ? toWalletPnl(data) : null;
}

/**
 * Scored wallets, for the copy-trading board.
 *
 * Defaults to realised profit rather than win rate on purpose. Win rate alone
 * ranks a wallet that scalped thirty guaranteed spreads above one that took
 * four losses and a hundredfold winner, and the second is the one worth
 * following.
 */
export async function getWalletPnl({
  sort = "realised",
  minClosed = 3,
  minWinRate = 0,
  limit = 100,
}: {
  sort?: PnlSort;
  minClosed?: number;
  minWinRate?: number;
  limit?: number;
} = {}): Promise<WalletPnl[]> {
  const supabase = client();
  if (!supabase) return [];

  const column =
    sort === "winRate"
      ? "win_rate_pct"
      : sort === "activity"
        ? "trade_count"
        : "realised_quote";

  const { data, error } = await supabase
    .from("wallet_pnl")
    .select("*")
    .gte("win_rate_pct", minWinRate)
    .order(column, { ascending: false })
    .limit(limit * 2);

  if (error) {
    console.error("[wallets] getWalletPnl error:", error.message);
    return [];
  }

  const rows = (data ?? []).map(toWalletPnl);

  return rows
    .filter((r) => r.wins + r.losses >= minClosed)
    .filter((r) => !r.likelyBot)
    .slice(0, limit);
}
