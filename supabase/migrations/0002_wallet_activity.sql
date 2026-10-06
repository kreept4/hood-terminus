-- ════════════════════════════════════════════════════════════════════════
-- Wallet activity tracking, added on top of 0001_init.sql.
--
-- Two tables:
--   swaps            raw event log, written only by the watch-swaps worker.
--                     Internal only — no grants to anon/authenticated. If
--                     this fills the free tier, this is the table to move to
--                     a separate Postgres instance (see docs/10-zero-budget-
--                     hosting.md for the pattern already chosen for that).
--   wallet_rankings   derived, public, read-only. Refreshed on a timer by
--                     the rollup script, never written from a request path.
--
-- What this version tracks: trade count, distinct pools traded, and last
-- active block, over a rolling 7-day window. This is an activity ranking,
-- not a P&L ranking — win rate and ROI need a FIFO positions engine on top
-- of this raw data, which is a follow-up, not part of this pass.
--
-- Run this in the Supabase SQL Editor after 0001_init.sql.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.swaps (
  id bigserial primary key,
  block_number bigint not null,
  tx_hash text not null,
  log_index int not null,
  pool_address text not null,
  -- Approximated as the swap's `to` address. Right most of the time, but
  -- can be a router address on multi-hop trades. Known simplification.
  wallet_address text not null,
  sender_address text not null,
  amount0_in numeric not null,
  amount1_in numeric not null,
  amount0_out numeric not null,
  amount1_out numeric not null,
  created_at timestamptz not null default now(),
  unique (tx_hash, log_index)
);

create index if not exists swaps_wallet_idx on public.swaps (wallet_address);
create index if not exists swaps_block_idx on public.swaps (block_number desc);
create index if not exists swaps_created_idx on public.swaps (created_at desc);

alter table public.swaps enable row level security;
-- No policies. Reachable only with the service role key, from the worker
-- and the rollup function below (security definer). Never exposed to the
-- browser, matching "automatically expose new tables: off".

create table if not exists public.wallet_rankings (
  wallet_address text primary key,
  trade_count int not null default 0,
  pool_count int not null default 0,
  last_active_block bigint,
  updated_at timestamptz not null default now()
);

alter table public.wallet_rankings enable row level security;
grant select on public.wallet_rankings to anon, authenticated;

drop policy if exists "wallet_rankings_public_read" on public.wallet_rankings;
create policy "wallet_rankings_public_read"
  on public.wallet_rankings for select
  using (true);

-- Aggregates the last 7 days of swaps into wallet_rankings. security definer
-- so the rollup script's service-role call can write to wallet_rankings even
-- though the anon/authenticated roles only have select on it.
create or replace function public.refresh_wallet_rankings()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallet_rankings
    (wallet_address, trade_count, pool_count, last_active_block, updated_at)
  select
    wallet_address,
    count(*)                    as trade_count,
    count(distinct pool_address) as pool_count,
    max(block_number)           as last_active_block,
    now()
  from public.swaps
  where created_at > now() - interval '7 days'
  group by wallet_address
  on conflict (wallet_address) do update set
    trade_count       = excluded.trade_count,
    pool_count         = excluded.pool_count,
    last_active_block = excluded.last_active_block,
    updated_at         = excluded.updated_at;
end;
$$;
