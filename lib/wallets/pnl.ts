import "server-only";
import { getTopPools, getTrendingPools } from "@/lib/market/gecko";

/**
 * Wallet performance, computed from public trade data.
 *
 * This was blocked on an indexer that does not exist. It turned out not to need
 * one: GeckoTerminal exposes trade-level data per pool, with the trader's
 * address on every row. Three hundred trades per pool, buy or sell, sized in
 * dollars and timestamped, which is exactly what a position engine consumes.
 *
 * ── What the numbers mean, precisely ───────────────────────────────────────
 *
 * Positions are matched FIFO: the first tokens bought are the first sold, which
 * is the convention every tax authority and every other screener uses. A
 * position closes when a wallet has sold as much as it bought, and only closed
 * positions count toward win rate. An open position is an opinion, not a
 * result.
 *
 * ── What it cannot see, and why that is stated on the page ─────────────────
 *
 * The window is the last three hundred trades per pool, which on an active pool
 * is hours rather than days. So:
 *
 *   - A wallet that bought before the window and sold inside it looks like it
 *     sold something it never bought. Those sells are discarded rather than
 *     counted as free profit.
 *   - A wallet that bought inside the window and has not sold shows as an open
 *     position and does not affect its win rate.
 *   - Tokens are counted separately. A wallet is scored on the pools it traded
 *     that this product tracks, not on everything it has ever done.
 *
 * None of that makes the number wrong. It makes it a number about a window, and
 * the window is named wherever the number appears.
 */

const BASE = "https://api.geckoterminal.com/api/v2";
const NETWORK = "robinhood";

/** Below this a "win rate" is a coin flip described in percentages. */
export const MIN_CLOSED_POSITIONS = 3;

type RawTrade = {
  attributes: {
    kind: "buy" | "sell";
    tx_from_address: string;
    from_token_amount: string;
    to_token_amount: string;
    volume_in_usd: string;
    block_timestamp: string;
  };
};

export type WalletScore = {
  address: string;
  /** Closed positions only. */
  wins: number;
  losses: number;
  winRatePct: number;
  realisedUsd: number;
  /** Every position, closed or not. */
  trades: number;
  tokens: number;
  /** Best and worst closed position, in percent. */
  bestPct: number | null;
  worstPct: number | null;
  lastSeen: string;
};

async function tradesFor(pool: string): Promise<RawTrade[]> {
  try {
    const res = await fetch(`${BASE}/networks/${NETWORK}/pools/${pool}/trades`, {
      headers: { accept: "application/json" },
      // Five minutes. The window moves slowly and this is the heaviest thing
      // the product asks of a free upstream.
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: RawTrade[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

type Lot = { tokens: number; usd: number };

/**
 * One wallet's positions in one token, matched FIFO.
 *
 * Buys push a lot. Sells consume lots oldest first, and each consumed lot
 * produces a realised result. A sell with no lot to match is dropped: it is a
 * position opened before the window, and counting it as pure profit would
 * invent a winner out of missing data.
 */
function matchPositions(trades: RawTrade[]) {
  const lots: Lot[] = [];
  const closed: { profitUsd: number; returnPct: number }[] = [];

  for (const t of trades) {
    const a = t.attributes;
    const usd = Number(a.volume_in_usd);
    if (!Number.isFinite(usd) || usd <= 0) continue;

    if (a.kind === "buy") {
      const tokens = Number(a.to_token_amount);
      if (!Number.isFinite(tokens) || tokens <= 0) continue;
      lots.push({ tokens, usd });
      continue;
    }

    let remaining = Number(a.from_token_amount);
    if (!Number.isFinite(remaining) || remaining <= 0) continue;
    const pricePerToken = usd / remaining;

    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(lot.tokens, remaining);
      const costBasis = (lot.usd / lot.tokens) * take;
      const proceeds = pricePerToken * take;

      if (costBasis > 0) {
        closed.push({
          profitUsd: proceeds - costBasis,
          returnPct: ((proceeds - costBasis) / costBasis) * 100,
        });
      }

      lot.tokens -= take;
      lot.usd -= costBasis;
      remaining -= take;
      if (lot.tokens <= 1e-12) lots.shift();
    }
    // Anything left unmatched was bought before the window. Dropped.
  }

  return closed;
}

/**
 * Score every wallet seen trading the tracked pools.
 *
 * Pools are capped because each one is a request against a free upstream, and
 * the deepest pools are where the traders worth scoring actually are.
 */
export async function scoreWallets(poolLimit = 12): Promise<WalletScore[]> {
  const [top, trending] = await Promise.all([getTopPools(), getTrendingPools()]);

  const seen = new Set<string>();
  const pools = [...trending, ...top]
    .filter((p) => {
      if (seen.has(p.address)) return false;
      seen.add(p.address);
      return (p.liquidityUsd ?? 0) > 5_000;
    })
    .slice(0, poolLimit);

  const batches = await Promise.all(pools.map((p) => tradesFor(p.address)));

  // Per wallet, per token, oldest first. The API returns newest first and FIFO
  // matching only means anything in chronological order.
  const byWallet = new Map<string, Map<string, RawTrade[]>>();

  batches.forEach((trades, i) => {
    const pool = pools[i].address;
    for (const t of [...trades].reverse()) {
      const wallet = t.attributes.tx_from_address?.toLowerCase();
      if (!wallet) continue;
      let tokens = byWallet.get(wallet);
      if (!tokens) {
        tokens = new Map();
        byWallet.set(wallet, tokens);
      }
      const list = tokens.get(pool) ?? [];
      list.push(t);
      tokens.set(pool, list);
    }
  });

  const scores: WalletScore[] = [];

  for (const [address, tokens] of byWallet) {
    let wins = 0;
    let losses = 0;
    let realisedUsd = 0;
    let trades = 0;
    let best: number | null = null;
    let worst: number | null = null;
    let lastSeen = "";

    for (const list of tokens.values()) {
      trades += list.length;
      const last = list[list.length - 1]?.attributes.block_timestamp ?? "";
      if (last > lastSeen) lastSeen = last;

      for (const position of matchPositions(list)) {
        realisedUsd += position.profitUsd;
        if (position.profitUsd > 0) wins++;
        else losses++;
        if (best === null || position.returnPct > best) best = position.returnPct;
        if (worst === null || position.returnPct < worst) worst = position.returnPct;
      }
    }

    const totalClosed = wins + losses;
    if (totalClosed < MIN_CLOSED_POSITIONS) continue;

    scores.push({
      address,
      wins,
      losses,
      winRatePct: (wins / totalClosed) * 100,
      realisedUsd,
      trades,
      tokens: tokens.size,
      bestPct: best,
      worstPct: worst,
      lastSeen,
    });
  }

  // Realised dollars first, not win rate. A wallet that closed five positions
  // for a dollar each has a perfect record and has proved nothing; sorting on
  // the percentage alone puts exactly those at the top.
  scores.sort((a, b) => b.realisedUsd - a.realisedUsd);
  return scores;
}
