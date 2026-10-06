-- ════════════════════════════════════════════════════════════════════════
-- Wallet performance, on top of the raw swap log.
--
-- 0002 gave an activity ranking: how much a wallet trades. This is the other
-- half, and the one people asked for: how well.
--
-- Deliberately NOT a SQL rollup. Matching positions FIFO means walking a
-- wallet's trades in order and consuming lots against sells, which is a loop
-- with state. Postgres can express it with window functions and recursive
-- CTEs, and the result is unreadable and slow. The worker does it in a
-- language with a for loop, and writes the answers here.
--
-- Profit is denominated in the pool's quote token, not dollars. The swap log
-- stores token amounts, and reconstructing historical USD would mean a price
-- oracle at every block. Quote-denominated profit needs none of that and is
-- what a trader on this chain thinks in anyway.
--
-- Run in the Supabase SQL Editor after 0002.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.wallet_pnl (
  wallet_address text primary key,

  -- Closed positions only. An open position is an opinion, not a result.
  wins            int    not null default 0,
  losses          int    not null default 0,
  win_rate_pct    numeric(6,2) not null default 0,

  -- In the quote token, summed across pools. Comparable because on this chain
  -- nearly every market quotes against WETH.
  realised_quote  numeric not null default 0,

  -- Every trade seen, closed or not, and how many distinct markets.
  trade_count     int not null default 0,
  pool_count      int not null default 0,

  best_pct        numeric(10,2),
  worst_pct       numeric(10,2),

  -- The window these numbers describe. Shown wherever they are, because a
  -- win rate without a window is a number pretending to be a fact.
  window_start    timestamptz,
  window_end      timestamptz,

  updated_at      timestamptz not null default now()
);

-- The three orderings the leaderboard offers. Without these, sorting eleven
-- thousand wallets is a sequential scan on every page load.
create index if not exists wallet_pnl_realised_idx
  on public.wallet_pnl (realised_quote desc);
create index if not exists wallet_pnl_winrate_idx
  on public.wallet_pnl (win_rate_pct desc);
create index if not exists wallet_pnl_trades_idx
  on public.wallet_pnl (trade_count desc);

alter table public.wallet_pnl enable row level security;
grant select on public.wallet_pnl to anon, authenticated;

drop policy if exists "wallet_pnl_public_read" on public.wallet_pnl;
create policy "wallet_pnl_public_read"
  on public.wallet_pnl for select
  using (true);

-- Which token a pool quotes against, so the worker knows which side of a swap
-- is the money and which is the position. Written by the worker as it learns
-- them; read by the rollup.
create table if not exists public.pool_meta (
  pool_address  text primary key,
  token0        text,
  token1        text,
  -- 0 or 1: which of the two is the quote asset (WETH, USDG and the like).
  quote_index   smallint,
  quote_symbol  text,
  base_symbol   text,
  updated_at    timestamptz not null default now()
);

alter table public.pool_meta enable row level security;
grant select on public.pool_meta to anon, authenticated;

drop policy if exists "pool_meta_public_read" on public.pool_meta;
create policy "pool_meta_public_read"
  on public.pool_meta for select
  using (true);
