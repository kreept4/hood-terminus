-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase: the app-facing database.
--
-- This holds ONLY derived data and user state. The raw event log (swaps,
-- liquidity_events, cursors) lives in Postgres on the worker host, because
-- Supabase free is 500MB and raw swaps on a 100ms-block chain would eat it in
-- days. See docs/10-zero-budget-hosting.md.
--
-- That split is not only about cost. The read path is now physically incapable
-- of running an aggregate over the swap log, because the swap log is not in
-- this database.
--
-- Write access: the worker, using the service role key. Nothing else.
-- Read access: anon, through the RLS policies at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;

-- ── types ──────────────────────────────────────────────────────────────────

create type protocol      as enum ('v2', 'v3', 'v4');
create type metric_window as enum ('24h', '7d', '30d');
create type risk_result   as enum ('pass', 'fail', 'unknown');
create type tx_status     as enum ('pending', 'confirmed', 'failed');
create type alert_kind    as enum (
  'wallet_bought', 'wallet_sold', 'wallet_early_entry',
  'liquidity_change', 'price_move', 'volume_spike', 'price_target'
);

-- ── tokens ─────────────────────────────────────────────────────────────────
-- Addresses are bytea, not text: 20 bytes instead of 42, no checksum-case
-- bugs, fixed-width joins. The codec lives in lib/chain and is the only place
-- that converts.

create table tokens (
  address        bytea primary key check (length(address) = 20),
  symbol         text,
  name           text,
  decimals       smallint not null default 18,
  total_supply   numeric(78,0),
  creator        bytea check (creator is null or length(creator) = 20),
  created_block  bigint,
  created_at     timestamptz,
  first_seen_at  timestamptz not null default now(),
  logo_url       text,
  description    text,
  socials        jsonb not null default '{}'::jsonb,

  -- Sanitised strings. The UI reads ONLY these. Raw on-chain symbol and name
  -- are attacker-controlled and are never rendered: NFKC normalised, bidi and
  -- control characters stripped, length capped. See docs/06 section 1.3.
  display_symbol text,
  display_name   text,
  sanitized_at   timestamptz,

  -- Set when display_symbol collides with a higher-liquidity token. Surfaced
  -- in the UI rather than silently ranking both.
  symbol_collision boolean not null default false,
  is_hidden        boolean not null default false,

  constraint tokens_symbol_len check (length(coalesce(symbol, '')) <= 64),
  constraint tokens_name_len   check (length(coalesce(name, ''))   <= 128)
);

create index tokens_created_at_idx on tokens (created_at desc nulls last);
create index tokens_symbol_trgm    on tokens using gin (display_symbol gin_trgm_ops);
create index tokens_name_trgm      on tokens using gin (display_name gin_trgm_ops);

-- ── pools ──────────────────────────────────────────────────────────────────
-- v4 pools have no address, only a PoolId. v2 and v3 have an address and no
-- pool key. Exactly one of the two is always present.

create table pools (
  id             bigserial primary key,
  protocol       protocol not null,
  address        bytea check (address is null or length(address) = 20),
  pool_key_hash  bytea check (pool_key_hash is null or length(pool_key_hash) = 32),
  token0         bytea not null references tokens(address),
  token1         bytea not null references tokens(address),
  fee_bps        integer,
  tick_spacing   integer,
  hooks          bytea,
  created_block  bigint not null,
  created_at     timestamptz not null,
  creator        bytea,
  launchpad      text,

  -- The non-quote side of the pair, resolved at ingest so no read path has to
  -- work it out.
  base_token     bytea not null references tokens(address),
  quote_token    bytea not null references tokens(address),

  -- Whether this pool is inside the bounded ingest universe. The worker owns
  -- this flag; the size of the tracked set is what caps our RPC spend.
  is_tracked     boolean not null default true,

  constraint pools_identity check (
    (address is not null and pool_key_hash is null) or
    (address is null and pool_key_hash is not null)
  )
);

create unique index pools_addr_uniq on pools (protocol, address)       where address is not null;
create unique index pools_key_uniq  on pools (protocol, pool_key_hash) where pool_key_hash is not null;
create index pools_created_at_idx   on pools (created_at desc);
create index pools_base_idx         on pools (base_token);
create index pools_tracked_idx      on pools (is_tracked) where is_tracked;

-- ── the live feed ──────────────────────────────────────────────────────────
-- Supabase Realtime publishes inserts here and this is the product's front
-- door. The worker only inserts rows that clear a baseline threshold, because
-- the free tier allows 2M realtime messages a month and an unfiltered feed on
-- this chain would exceed that on its own. Filtering server-side is also the
-- right product call: an unfiltered launch feed is mostly noise.

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

-- ── derived: candles ───────────────────────────────────────────────────────

create table candles (
  pool_id     bigint not null references pools(id) on delete cascade,
  timeframe   text not null check (timeframe in ('1m','5m','15m','1h','4h','1d')),
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

-- ── derived: the snapshot Discover reads ───────────────────────────────────
-- One row per token, refreshed by a job. This is the single most important
-- performance decision in the schema: the highest-traffic surface in the
-- product is an index scan, never an aggregate.

create table token_stats (
  token_address   bytea primary key references tokens(address) on delete cascade,
  primary_pool    bigint references pools(id),
  price_usd       numeric(36,18),
  mcap_usd        numeric(24,6),
  liquidity_usd   numeric(24,6),
  vol_5m_usd      numeric(24,6) not null default 0,
  vol_1h_usd      numeric(24,6) not null default 0,
  vol_24h_usd     numeric(24,6) not null default 0,
  chg_5m_pct      numeric(12,4),
  chg_1h_pct      numeric(12,4),
  chg_24h_pct     numeric(12,4),
  liq_chg_15m_pct numeric(12,4),
  buys_5m         integer not null default 0,
  sells_5m        integer not null default 0,
  holders         integer,
  momentum_score  numeric(12,4),
  -- Every surface reading this table renders a staleness indicator from
  -- updated_at. A failed rollup job must never present old data as live.
  updated_at      timestamptz not null default now()
);

create index token_stats_momentum_idx on token_stats (momentum_score desc nulls last);
create index token_stats_liq_idx      on token_stats (liquidity_usd desc nulls last);
create index token_stats_gainers_idx  on token_stats (chg_1h_pct desc nulls last);
create index token_stats_losers_idx   on token_stats (chg_1h_pct asc  nulls last);
create index token_stats_liqdrop_idx  on token_stats (liq_chg_15m_pct asc nulls last);

-- ── derived: deterministic risk ────────────────────────────────────────────
-- No model, no score we cannot explain line by line. 'unknown' is a real
-- result and is rendered as unknown, never rounded up to a pass.

create table token_risk (
  token_address          bytea primary key references tokens(address) on delete cascade,
  verified               risk_result not null default 'unknown',
  mintable               risk_result not null default 'unknown',
  owner_renounced        risk_result not null default 'unknown',
  sell_simulated         risk_result not null default 'unknown',
  buy_tax_bps            integer,
  sell_tax_bps           integer,
  lp_locked_or_burned    risk_result not null default 'unknown',
  top10_pct              numeric(6,2),
  dev_holding_pct        numeric(6,2),
  creator_prior_launches integer,
  creator_prior_rugs     integer,
  computed_at            timestamptz not null default now()
);

-- ── derived: positions ─────────────────────────────────────────────────────
-- FIFO lots per (wallet, token). The single source of truth for both the
-- wallet ranker and a user's own portfolio, so the two can never disagree.
--
-- Positions persist even though raw swaps do not: the worker folds swaps into
-- positions inside the retention window, and the positions carry forward. That
-- is what lets a 7-day ranking window fit in a 500MB database.

create table positions (
  id               bigserial primary key,
  wallet           bytea not null check (length(wallet) = 20),
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
  -- nth buyer of this token, for the early-entry metric
  entry_rank       integer,
  -- Entered by transfer, so cost basis is unknowable. Excluded from every
  -- metric, and the wallet profile reports how many were excluded.
  is_unpriceable   boolean not null default false,
  is_complete      boolean not null default false
);

create index positions_wallet_idx on positions (wallet, opened_at desc);
create index positions_token_idx  on positions (token_address, opened_at desc);
create unique index positions_open_uniq
  on positions (wallet, token_address) where closed_at is null;

-- ── derived: wallet metrics and rankings ───────────────────────────────────

create table wallet_metrics (
  wallet            bytea not null check (length(wallet) = 20),
  window            metric_window not null,
  trades_completed  integer not null,
  wins              integer not null,
  losses            integer not null,
  win_rate          numeric(6,4),
  -- Shrunk toward the population mean by trade count, so three wins from three
  -- trades cannot outrank forty from fifty-five. This is the value the score
  -- uses; win_rate above is shown raw alongside it.
  win_rate_shrunk   numeric(6,4),
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
  -- Excluded by the counterparty-concentration filter. Kept rather than
  -- deleted so an exclusion can be explained if someone asks.
  excluded_reason   text,
  computed_at       timestamptz not null default now(),
  primary key (wallet, window)
);

-- Written as generations, never updated in place. Each run inserts a new
-- computed_at cohort under an advisory lock and readers take the newest
-- complete one, so a top 100 is never half from one run and half from another.
create table wallet_rankings (
  window      metric_window not null,
  computed_at timestamptz not null,
  rank        integer not null,
  wallet      bytea not null,
  score       numeric(12,6) not null,
  primary key (window, computed_at, rank)
);

create index wallet_rankings_current_idx
  on wallet_rankings (window, computed_at desc, rank);

-- ── job observability ──────────────────────────────────────────────────────
-- Every scheduled job writes exactly one row. Two consecutive failures for the
-- same job raise an alert to us, never to users.

create table job_runs (
  id           bigserial primary key,
  job          text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  rows_written integer,
  cursor_to    bigint,
  error        text
);

create index job_runs_job_idx on job_runs (job, started_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- User state
--
-- Guests get a real auth.uid() from Supabase anonymous auth on first load,
-- with no UI and no email. "No account" and "no identity" are different
-- things: a watchlist written server-side needs an identity or the endpoint is
-- open to anyone.
-- ═══════════════════════════════════════════════════════════════════════════

create table app_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  -- Set only after a signature challenge links a wallet, so a guest's
  -- watchlist survives connecting.
  wallet     bytea unique check (wallet is null or length(wallet) = 20),
  created_at timestamptz not null default now()
);

create table watchlist (
  user_id       uuid not null references app_users(id) on delete cascade,
  token_address bytea not null references tokens(address) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, token_address)
);

-- Following a wallet requires no wallet connection. This is public chain data.
create table wallet_follows (
  user_id    uuid not null references app_users(id) on delete cascade,
  wallet     bytea not null check (length(wallet) = 20),
  created_at timestamptz not null default now(),
  primary key (user_id, wallet)
);

create table alert_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_users(id) on delete cascade,
  kind          alert_kind not null,
  -- Validated against a per-kind zod schema before insert. A rule whose params
  -- do not match its kind is rejected, not stored and silently ignored later.
  params        jsonb not null,
  enabled       boolean not null default true,
  -- Mandatory. One volatile token must not be able to fire forty alerts.
  cooldown_s    integer not null default 300 check (cooldown_s >= 30),
  last_fired_at timestamptz,
  created_at    timestamptz not null default now()
);

create index alert_rules_active_idx on alert_rules (kind) where enabled;

create table alert_events (
  id         bigserial primary key,
  rule_id    uuid not null references alert_rules(id) on delete cascade,
  user_id    uuid not null references app_users(id) on delete cascade,
  payload    jsonb not null,
  -- Dedupe key: (rule, subject, minute bucket). Prevents the same condition
  -- firing twice inside one bucket.
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create unique index alert_events_dedupe_uniq on alert_events (rule_id, dedupe_key);
create index alert_events_user_idx on alert_events (user_id, created_at desc);

alter publication supabase_realtime add table alert_events;

-- Transactions we prepared, so the UI recovers state after a refresh or a
-- mobile app switch. We store the hash and a summary, never anything signable.
create table user_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_users(id) on delete cascade,
  kind       text not null check (kind in ('swap','approve','deploy','add_liquidity')),
  tx_hash    bytea,
  status     tx_status not null default 'pending',
  chain_id   integer not null default 4663,
  summary    jsonb not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index user_transactions_user_idx on user_transactions (user_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- Row level security
--
-- Public data: readable by anon, with NO insert, update or delete policy at
-- all. The worker writes with the service role key, which bypasses RLS and
-- exists only server-side.
--
-- User data: one policy shape, user_id = auth.uid().
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'tokens','pools','token_launches','candles','token_stats','token_risk',
    'positions','wallet_metrics','wallet_rankings'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy public_read on %I for select to anon, authenticated using (true)', t
    );
  end loop;
end $$;

-- job_runs is operational, not public.
alter table job_runs enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'app_users','watchlist','wallet_follows','alert_rules','alert_events',
    'user_transactions'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy own_row on app_users
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'watchlist','wallet_follows','alert_rules','alert_events','user_transactions'
  ] loop
    execute format(
      'create policy own_rows on %I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t
    );
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Table privileges
--
-- The project is created with "Automatically expose new tables" OFF, so the
-- Data API roles receive no privileges by default. That makes API access an
-- explicit allowlist rather than an opt-out, which is what we want.
--
-- It also means an RLS policy on its own is not enough: without a GRANT the
-- API returns permission denied even when the policy would allow the row. RLS
-- narrows what a role can see; the GRANT is what lets it reach the table at
-- all. Both are required, and both are listed here explicitly so adding a
-- table never silently exposes it.
-- ═══════════════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated;

-- Public, read-only. Derived chain data. Writes come from the worker using the
-- service role key, which bypasses RLS and never leaves the server.
do $$
declare t text;
begin
  foreach t in array array[
    'tokens','pools','token_launches','candles','token_stats','token_risk',
    'positions','wallet_metrics','wallet_rankings'
  ] loop
    execute format('grant select on %I to anon, authenticated', t);
  end loop;
end $$;

-- User state. Readable and writable only by its owner, enforced by the RLS
-- policies above. anon gets nothing here: a guest is an authenticated user via
-- anonymous sign-in, not the anon role.
do $$
declare t text;
begin
  foreach t in array array[
    'app_users','watchlist','wallet_follows','alert_rules','alert_events',
    'user_transactions'
  ] loop
    execute format(
      'grant select, insert, update, delete on %I to authenticated', t
    );
  end loop;
end $$;

-- bigserial primary keys need their sequence to be usable by the inserting
-- role. Without this an owner-scoped insert fails on the sequence, not on RLS,
-- which is a confusing error to debug later.
grant usage, select on sequence alert_events_id_seq to authenticated;

-- job_runs is operational. No role is granted anything, so it is reachable
-- only with the service role key. Deliberate, not an omission.

-- Nothing is granted on future tables. A new table is unreachable by the API
-- until someone writes its GRANT and its policy, which is the point.
