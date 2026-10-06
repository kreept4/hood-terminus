/**
 * Wallet performance, computed from the indexed swap log.
 *
 * Reads `swaps`, matches every wallet's positions FIFO, and writes the result
 * to `wallet_pnl`. Run on a timer; it is idempotent and recomputes the whole
 * window each time rather than trying to update incrementally, because an
 * incremental P&L that drifts is worse than a slower one that cannot.
 *
 * ── Why plain JavaScript ───────────────────────────────────────────────────
 *
 * No build step, no bundler, no TypeScript runner to keep in sync with the
 * app's. A worker that runs on a cron somewhere should be a file you can copy
 * to a box and run with `node`.
 *
 * ── What "profit" means here ───────────────────────────────────────────────
 *
 * Denominated in the pool's quote token, not dollars. The swap log stores token
 * amounts, and turning those into historical USD would need a price at every
 * block. Quote-denominated profit needs nothing extra and is what a trader on
 * this chain thinks in.
 *
 * Positions match FIFO: first bought is first sold. A position closes when a
 * wallet has sold as much as it bought, and only closed positions count toward
 * a win rate. An open position is an opinion, not a result.
 *
 * A sell with no matching buy is discarded rather than counted as pure profit.
 * It means the wallet opened that position before the indexed window began, and
 * counting it would invent a winner out of missing data.
 *
 *   node worker/rollup-pnl.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RPC =
  process.env.ALCHEMY_HTTPS_URL ?? "https://rpc.mainnet.chain.robinhood.com";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/**
 * WETH-quoted pools only, and nothing else.
 *
 * The obvious improvement here is to accept every asset a pool might quote
 * against, and it produces nonsense. Profit in a MEME-quoted pool is measured
 * in MEME; adding it to profit measured in ETH is adding two different units
 * and calling the total a number. Decimals compound it: USDG has six, WETH has
 * eighteen, so a single shared divisor inflates one of them by a factor of a
 * trillion.
 *
 * A first run did exactly that and reported a wallet up 189 ETH in a week on a
 * 25 percent win rate. Obviously wrong, which is the only reason it was caught.
 *
 * So: one quote asset, one unit, one set of decimals. Every figure below is
 * genuinely ETH and genuinely additive. It costs coverage, and coverage is the
 * cheaper thing to lose.
 */
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";

/** Below this a win rate is a coin flip wearing a percentage sign. */
const MIN_CLOSED = 3;

/** How far back to compute. Matches the ranking window in 0002. */
const WINDOW_DAYS = 7;

const token0Selector = "0x0dfe1681";
const token1Selector = "0xd21220a7";

/**
 * token0 and token1 for a set of pools, in batched JSON-RPC.
 *
 * The swap log stores amounts per side but not which side is which asset, and
 * that is the whole question: one side is money, the other is the position.
 */
async function poolSides(pools) {
  const sides = new Map();
  const list = [...pools];

  for (let i = 0; i < list.length; i += 40) {
    const chunk = list.slice(i, i + 40);
    const calls = [];
    chunk.forEach((pool, n) => {
      calls.push({
        jsonrpc: "2.0",
        id: n * 2,
        method: "eth_call",
        params: [{ to: pool, data: token0Selector }, "latest"],
      });
      calls.push({
        jsonrpc: "2.0",
        id: n * 2 + 1,
        method: "eth_call",
        params: [{ to: pool, data: token1Selector }, "latest"],
      });
    });

    try {
      const res = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(calls),
      });
      if (!res.ok) continue;
      const rows = await res.json();
      const byId = new Map(
        (Array.isArray(rows) ? rows : [rows])
          .filter((r) => r.result)
          .map((r) => [r.id, r.result]),
      );

      chunk.forEach((pool, n) => {
        const t0 = byId.get(n * 2);
        const t1 = byId.get(n * 2 + 1);
        if (!t0 || !t1) return;
        sides.set(pool, {
          token0: ("0x" + t0.slice(-40)).toLowerCase(),
          token1: ("0x" + t1.slice(-40)).toLowerCase(),
          quoteIndex: null,
        });
      });
    } catch {
      // Node unreachable for this chunk. Those pools are skipped this run.
    }
  }

  // Which side of each pool is the money.
  let priced = 0;
  for (const side of sides.values()) {
    // Exactly one side must be WETH. WETH against WETH is not a pair, and
    // neither side being WETH is a market this cannot measure in ETH.
    if (side.token1 === WETH && side.token0 !== WETH) side.quoteIndex = 1;
    else if (side.token0 === WETH && side.token1 !== WETH) side.quoteIndex = 0;
    if (side.quoteIndex !== null) priced++;
  }

  console.log(`weth     ${priced} pools quote against ETH`);
  return sides;
}

/** Every swap in the window, paged out of PostgREST's row cap. */
async function readSwaps(since) {
  const rows = [];
  const PAGE = 1000;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("swaps")
      .select(
        "block_number,pool_address,wallet_address,amount0_in,amount1_in,amount0_out,amount1_out,created_at",
      )
      .gte("created_at", since)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  return rows;
}

/**
 * One wallet's positions in one pool, matched FIFO.
 *
 * Buys push a lot of (base tokens, quote spent). Sells consume lots oldest
 * first, each producing a realised result.
 */
function matchPositions(trades, quoteIndex) {
  const lots = [];
  const closed = [];

  for (const t of trades) {
    const quoteIn = Number(quoteIndex === 1 ? t.amount1_in : t.amount0_in);
    const quoteOut = Number(quoteIndex === 1 ? t.amount1_out : t.amount0_out);
    const baseIn = Number(quoteIndex === 1 ? t.amount0_in : t.amount1_in);
    const baseOut = Number(quoteIndex === 1 ? t.amount0_out : t.amount1_out);

    // Spent quote, received base: a buy.
    if (quoteIn > 0 && baseOut > 0) {
      lots.push({ base: baseOut, quote: quoteIn });
      continue;
    }

    // Spent base, received quote: a sell.
    if (baseIn > 0 && quoteOut > 0) {
      let remaining = baseIn;
      const pricePerBase = quoteOut / baseIn;

      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(lot.base, remaining);
        const cost = (lot.quote / lot.base) * take;
        const proceeds = pricePerBase * take;

        if (cost > 0) {
          closed.push({
            profit: proceeds - cost,
            returnPct: ((proceeds - cost) / cost) * 100,
          });
        }

        lot.base -= take;
        lot.quote -= cost;
        remaining -= take;
        if (lot.base <= 1e-9) lots.shift();
      }
      // Anything unmatched was bought before the window. Dropped.
    }
  }

  return closed;
}

async function main() {
  const since = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  console.log(`window   from ${since}`);
  const swaps = await readSwaps(since);
  console.log(`swaps    ${swaps.length.toLocaleString("en-US")}`);

  if (swaps.length === 0) {
    console.log("Nothing to roll up.");
    return;
  }

  const pools = new Set(swaps.map((s) => s.pool_address.toLowerCase()));
  console.log(`pools    ${pools.size}`);

  const sides = await poolSides(pools);

  // wallet -> pool -> trades, in order. FIFO only means anything in sequence,
  // and the read above is ordered by insertion id.
  const byWallet = new Map();
  for (const s of swaps) {
    const pool = s.pool_address.toLowerCase();
    const side = sides.get(pool);
    if (!side || side.quoteIndex === null) continue;

    const wallet = s.wallet_address.toLowerCase();
    let pools_ = byWallet.get(wallet);
    if (!pools_) {
      pools_ = new Map();
      byWallet.set(wallet, pools_);
    }
    const list = pools_.get(pool) ?? [];
    list.push(s);
    pools_.set(pool, list);
  }

  console.log(`wallets  ${byWallet.size.toLocaleString("en-US")}`);

  const rows = [];
  const windowEnd = new Date().toISOString();

  for (const [wallet, pools_] of byWallet) {
    let wins = 0;
    let losses = 0;
    let realised = 0;
    let trades = 0;
    let best = null;
    let worst = null;

    for (const [pool, list] of pools_) {
      trades += list.length;
      const side = sides.get(pool);
      for (const p of matchPositions(list, side.quoteIndex)) {
        if (!Number.isFinite(p.profit) || !Number.isFinite(p.returnPct)) continue;
        realised += p.profit;
        if (p.profit > 0) wins++;
        else losses++;
        if (best === null || p.returnPct > best) best = p.returnPct;
        if (worst === null || p.returnPct < worst) worst = p.returnPct;
      }
    }

    const totalClosed = wins + losses;
    if (totalClosed < MIN_CLOSED) continue;

    rows.push({
      wallet_address: wallet,
      wins,
      losses,
      win_rate_pct: Number(((wins / totalClosed) * 100).toFixed(2)),
      // Wei to whole units. Postgres numeric holds it either way; whole units
      // are what the UI renders and what a person can read in a query.
      realised_quote: Number((realised / 1e18).toFixed(8)),
      trade_count: trades,
      pool_count: pools_.size,
      best_pct: best === null ? null : Number(Math.min(best, 99999999).toFixed(2)),
      worst_pct:
        worst === null ? null : Number(Math.max(worst, -99999999).toFixed(2)),
      window_start: since,
      window_end: windowEnd,
      updated_at: windowEnd,
    });
  }

  console.log(`scored   ${rows.length.toLocaleString("en-US")} wallets`);

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from("wallet_pnl")
      .upsert(rows.slice(i, i + 500), { onConflict: "wallet_address" });
    if (error) throw new Error(error.message);
  }

  const top = [...rows]
    .sort((a, b) => b.realised_quote - a.realised_quote)
    .slice(0, 8);

  console.log("\n  wallet          win%    W/L      realised ETH   pools");
  for (const r of top) {
    console.log(
      `  ${r.wallet_address.slice(0, 14)}  ${String(r.win_rate_pct).padStart(5)}  ` +
        `${(r.wins + "/" + r.losses).padStart(7)}  ${String(r.realised_quote).padStart(14)}  ` +
        `${String(r.pool_count).padStart(5)}`,
    );
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
