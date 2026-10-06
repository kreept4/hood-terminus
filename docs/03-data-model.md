# Data model

> **Superseded in one respect.** This document describes a single Postgres.
> The zero-budget constraint splits it in two: the raw event log (`swaps`,
> `liquidity_events`, `indexer_cursors`) moved to Postgres on the worker host,
> and Supabase holds only derived and user-facing data. See
> `10-zero-budget-hosting.md`. Everything else below is unchanged, and the
> runnable versions are `supabase/migrations/0001_init.sql` and
> `worker/db/schema.sql`.

Postgres via Supabase. Written for the bounded-hybrid architecture in `02`.

Three groups of tables, with deliberately different rules:

1. **Chain facts.** Written only by the indexer worker. Append-only, deduped by
   `(tx_hash, log_index)`. Never written from a request path.
2. **Derived metrics.** Written only by cron jobs. Fully recomputable from group 1, so any of
   it can be dropped and rebuilt.
3. **User state.** Written by users through RLS-protected policies. Small.

If a number can be recomputed, it lives in group 2 and never in group 1.

## Identity, before the schema

Guests need watchlists and follows without connecting a wallet, but writing to Postgres
without an identity means an open write endpoint.

Decision: **Supabase anonymous auth**. Every visitor gets a real `auth.uid()` on first load
with no UI. RLS works normally. When they connect a wallet we link the address to the same
user row through a signature challenge, so their watchlist survives. No email, no password,
no personal data. A guest who clears storage loses their list, which is an acceptable trade
for having zero account friction.

## Enums

```sql
create type protocol      as enum ('v2', 'v3', 'v4');
create type trade_side    as enum ('buy', 'sell');
create type metric_window as enum ('24h', '7d', '30d');
create type risk_result   as enum ('pass', 'fail', 'unknown');
create type alert_kind    as enum (
  'wallet_bought', 'wallet_sold', 'wallet_early_entry',
  'liquidity_change', 'price_move', 'volume_spike', 'price_target'
);
create type tx_status     as enum ('pending', 'confirmed', 'failed');
```

## Group 1: chain facts

```sql
-- Every token we have seen, whether or not it has a pool.
create table tokens (
  address        bytea primary key,                    -- 20 bytes, never a string
  symbol         text,
  name           text,
  decimals       smallint not null default 18,
  total_supply   numeric(78,0),
  creator        bytea,
  created_block  bigint,
  created_at     timestamptz,
  first_seen_at  timestamptz not null default now(),
  logo_url       text,
  description    text,
  socials        jsonb not null default '{}'::jsonb,
  -- set by the sanitiser, see 06. Raw on-chain strings are never rendered.
  display_symbol text,
  display_name   text,
  sanitized_at   timestamptz,
  is_hidden      boolean not null default false,
  constraint tokens_symbol_len check (length(coalesce(symbol,'')) <= 64),
  constraint tokens_name_len   check (length(coalesce(name,''))   <= 128)
);
create index tokens_created_at_idx on tokens (created_at desc nulls last);
create index tokens_symbol_trgm    on tokens using gin (display_symbol gin_trgm_ops);
create index tokens_name_trgm      on tokens using gin (display_name gin_trgm_ops);

-- Pools across v2, v3 and v4. v4 pools have no address, only a pool id.
create table pools (
  id             bigserial primary key,
  protocol       protocol not null,
  address        bytea,                                -- null for v4
  pool_key_hash  bytea,                                -- v4 PoolId, null for v2/v3
  token0         bytea not null references tokens(address),
  token1         bytea not null references tokens(address),
  fee_bps        integer,
  tick_spacing   integer,
  hooks          bytea,                                -- v4 hook contract, null if none
  created_block  bigint not null,
  created_at     timestamptz not null,
  creator        bytea,
  launchpad      text,                                 -- 'pools.trade', 'hood.fun', null
  -- the token in this pool that is NOT the quote asset
  base_token     bytea not null references tokens(address),
  quote_token    bytea not null references tokens(address),
  is_tracked     boolean not null default true,        -- in the bounded ingest universe
  unique (protocol, address),
  unique (protocol, pool_key_hash)
);
create index pools_created_at_idx on pools (created_at desc);
create index pools_base_idx       on pools (base_token);
create index pools_tracked_idx    on pools (is_tracked) where is_tracked;

-- The live feed table. Supabase Realtime publishes inserts here.
create table token_launches (
  pool_id          bigint primary key references pools(id) on delete cascade,
  token_address    bytea not null references tokens(address),
  launched_at      timestamptz not null,
  block_number     bigint not null,
  dev_wallet       bytea,
  initial_liq_usd  numeric(24,6),
  launchpad        text
);
create index token_launches_time_idx on token_launches (launched_at desc);
alter publication supabase_realtime add table token_launches;

-- Swaps. The biggest table by far. Partitioned by day so old partitions can be dropped
-- rather than deleted, which matters at 100ms block times.
create table swaps (
  block_time    timestamptz not null,
  block_number  bigint not null,
  tx_hash       bytea not null,
  log_index     integer not null,
  pool_id       bigint not null references pools(id),
  trader        bytea not null,                        -- tx origin, resolved past routers
  side          trade_side not null,                   -- relative to pools.base_token
  amount_base   numeric(78,0) not null,
  amount_quote  numeric(78,0) not null,
  price_usd     numeric(36,18),                        -- base price at execution
  value_usd     numeric(24,6),
  gas_used_wei  numeric(78,0),
  primary key (block_time, tx_hash, log_index)
) partition by range (block_time);

create index swaps_trader_time_idx on swaps (trader, block_time desc);
create index swaps_pool_time_idx   on swaps (pool_id, block_time desc);

-- Liquidity add and remove events. Drives the LP-pull alert, which is the highest-value
-- alert in the product.
create table liquidity_events (
  block_time   timestamptz not null,
  tx_hash      bytea not null,
  log_index    integer not null,
  pool_id      bigint not null references pools(id),
  provider     bytea,
  delta_base   numeric(78,0) not null,                 -- negative on removal
  delta_quote  numeric(78,0) not null,
  liq_usd_after numeric(24,6),
  primary key (block_time, tx_hash, log_index)
) partition by range (block_time);

-- Indexer durability. One row per subscription, so a restart resumes rather than replays.
create table indexer_cursors (
  stream        text primary key,                      -- 'pool_created', 'swaps', ...
  last_block    bigint not null,
  last_block_hash bytea,
  updated_at    timestamptz not null default now()
);
```

Retention: 30 days of `swaps` and `liquidity_events` partitions, dropped nightly. Rollups
below hold everything older, at a fraction of the size.

## Group 2: derived

```sql
-- OHLCV, one row per (pool, timeframe, bucket). Built forward from swaps by a 60s job.
create table candles (
  pool_id     bigint not null references pools(id) on delete cascade,
  timeframe   text not null,                           -- '1m','5m','15m','1h','4h','1d'
  bucket      timestamptz not null,
  open        numeric(36,18) not null,
  high        numeric(36,18) not null,
  low         numeric(36,18) not null,
  close       numeric(36,18) not null,
  volume_usd  numeric(24,6) not null default 0,
  trades      integer not null default 0,
  buys        integer not null default 0,
  sells       integer not null default 0,
  primary key (pool_id, timeframe, bucket)
);

-- Rolling snapshot per token, refreshed every 30s. This is what Discover reads.
-- One row per token means Discover is a single indexed scan, not a join across swaps.
create table token_stats (
  token_address  bytea primary key references tokens(address) on delete cascade,
  primary_pool   bigint references pools(id),
  price_usd      numeric(36,18),
  mcap_usd       numeric(24,6),
  liquidity_usd  numeric(24,6),
  vol_5m_usd     numeric(24,6) not null default 0,
  vol_1h_usd     numeric(24,6) not null default 0,
  vol_24h_usd    numeric(24,6) not null default 0,
  chg_5m_pct     numeric(12,4),
  chg_1h_pct     numeric(12,4),
  chg_24h_pct    numeric(12,4),
  liq_chg_15m_pct numeric(12,4),
  buys_5m        integer not null default 0,
  sells_5m       integer not null default 0,
  holders        integer,
  momentum_score numeric(12,4),                        -- published formula, see PRD 6.2
  updated_at     timestamptz not null default now()
);
create index token_stats_momentum_idx on token_stats (momentum_score desc nulls last);
create index token_stats_liq_idx      on token_stats (liquidity_usd desc nulls last);
create index token_stats_chg_idx      on token_stats (chg_1h_pct desc nulls last);

-- Deterministic risk checks. Recomputed on launch, then hourly for the first day.
create table token_risk (
  token_address     bytea primary key references tokens(address) on delete cascade,
  verified          risk_result not null default 'unknown',
  mintable          risk_result not null default 'unknown',
  owner_renounced   risk_result not null default 'unknown',
  sell_simulated    risk_result not null default 'unknown',
  buy_tax_bps       integer,
  sell_tax_bps      integer,
  lp_locked_or_burned risk_result not null default 'unknown',
  top10_pct         numeric(6,2),
  dev_holding_pct   numeric(6,2),
  creator_prior_launches integer,
  creator_prior_rugs     integer,
  computed_at       timestamptz not null default now()
);

-- Reconstructed positions. FIFO lots per (wallet, token). The single source of truth for
-- both the wallet ranker and the user's own portfolio, so the two can never disagree.
create table positions (
  id               bigserial primary key,
  wallet           bytea not null,
  token_address    bytea not null references tokens(address),
  opened_at        timestamptz not null,
  closed_at        timestamptz,
  qty_open         numeric(78,0) not null default 0,
  cost_basis_usd   numeric(24,6) not null default 0,
  proceeds_usd     numeric(24,6) not null default 0,
  gas_usd          numeric(24,6) not null default 0,
  realized_pnl_usd numeric(24,6) not null default 0,
  avg_entry_usd    numeric(36,18),
  avg_exit_usd     numeric(36,18),
  buy_legs         integer not null default 0,
  sell_legs        integer not null default 0,
  entry_rank       integer,                            -- nth buyer of this token, for early entry
  is_unpriceable   boolean not null default false,     -- entered by transfer, excluded everywhere
  is_complete      boolean not null default false      -- qty_open within dust of zero
);
create index positions_wallet_idx on positions (wallet, opened_at desc);
create index positions_token_idx  on positions (token_address, opened_at desc);
create unique index positions_open_uniq
  on positions (wallet, token_address) where closed_at is null;

-- Per-window wallet metrics. Recomputed wholesale every 12h, never incrementally patched,
-- so the numbers are always internally consistent.
create table wallet_metrics (
  wallet            bytea not null,
  window            metric_window not null,
  trades_completed  integer not null,
  wins              integer not null,
  losses            integer not null,
  win_rate          numeric(6,4),                      -- raw
  win_rate_shrunk   numeric(6,4),                      -- Bayesian, used in the score
  realized_pnl_usd  numeric(24,6) not null,
  roi_pct           numeric(14,4),
  volume_usd        numeric(24,6) not null,
  tokens_traded     integer not null,
  median_hold_secs  integer,
  early_entry_rate  numeric(6,4),
  consistency       numeric(6,4),
  max_drawdown_pct  numeric(10,4),
  unpriceable_count integer not null default 0,
  open_positions    integer not null default 0,
  computed_at       timestamptz not null default now(),
  primary key (wallet, window)
);

create table wallet_rankings (
  window      metric_window not null,
  rank        integer not null,
  wallet      bytea not null,
  score       numeric(12,6) not null,
  computed_at timestamptz not null,
  primary key (window, rank, computed_at)
);
create index wallet_rankings_current_idx on wallet_rankings (window, computed_at desc, rank);

-- Job observability. Every scheduled job writes exactly one row.
create table job_runs (
  id          bigserial primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  rows_written integer,
  cursor_to   bigint,
  error       text
);
create index job_runs_job_idx on job_runs (job, started_at desc);
```

## Group 3: user state

```sql
create table app_users (
  id           uuid primary key references auth.users(id) on delete cascade,
  wallet       bytea unique,                            -- set after signature link
  created_at   timestamptz not null default now()
);

create table watchlist (
  user_id       uuid not null references app_users(id) on delete cascade,
  token_address bytea not null references tokens(address) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, token_address)
);

create table wallet_follows (
  user_id    uuid not null references app_users(id) on delete cascade,
  wallet     bytea not null,
  created_at timestamptz not null default now(),
  primary key (user_id, wallet)
);

create table alert_rules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_users(id) on delete cascade,
  kind       alert_kind not null,
  -- shape is validated by a zod schema per kind before insert, never trusted raw
  params     jsonb not null,
  enabled    boolean not null default true,
  cooldown_s integer not null default 300,
  last_fired_at timestamptz,
  created_at timestamptz not null default now()
);
create index alert_rules_active_idx on alert_rules (kind) where enabled;

create table alert_events (
  id         bigserial primary key,
  rule_id    uuid not null references alert_rules(id) on delete cascade,
  user_id    uuid not null references app_users(id) on delete cascade,
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index alert_events_user_idx on alert_events (user_id, created_at desc);

-- Local record of transactions we prepared, so the UI can recover state after a refresh
-- and so we can report a real success rate. We store the hash, never anything signable.
create table user_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  kind        text not null,                            -- 'swap' | 'approve' | 'deploy' | 'add_liquidity'
  tx_hash     bytea,
  status      tx_status not null default 'pending',
  chain_id    integer not null default 4663,
  summary     jsonb not null,
  created_at  timestamptz not null default now(),
  settled_at  timestamptz
);
```

## RLS

```sql
alter table watchlist         enable row level security;
alter table wallet_follows    enable row level security;
alter table alert_rules       enable row level security;
alter table alert_events      enable row level security;
alter table user_transactions enable row level security;
alter table app_users         enable row level security;

-- one policy shape, repeated per table
create policy own_rows on watchlist
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Group 1 and group 2 tables have RLS enabled with a read-only policy for `anon` and no insert,
update or delete policy at all. The indexer and the cron jobs use the service role key, which
lives only in the worker and in server-side environment variables, never in the browser.

## Two schema decisions worth stating

**Addresses are `bytea`, not `text`.** 20 bytes instead of 42, no checksum-case bugs, and
joins on a fixed-width type. The cost is a codec at the edge, which is one small module.

**`token_stats` is a denormalised snapshot, deliberately.** Discover is the highest-traffic
surface in the product and it must never run an aggregate over `swaps`. One row per token,
refreshed by a job, means the whole page is an index scan on a table with as many rows as
there are tokens. This is the single most important performance decision in the schema.
