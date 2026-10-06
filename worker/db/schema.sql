-- ═══════════════════════════════════════════════════════════════════════════
-- Worker-local Postgres: the raw event log.
--
-- Runs on the same host as the indexer. The browser never reads these tables
-- and the Next.js app has no connection to this database at all. They exist to
-- be folded into the derived state that lives in Supabase.
--
-- Why here and not in Supabase: 500MB free tier, and a 100ms-block chain.
-- Why that is good rather than merely cheap: the read path is now physically
-- incapable of aggregating over the swap log.
-- ═══════════════════════════════════════════════════════════════════════════

create type trade_side as enum ('buy', 'sell');

-- ── swaps ──────────────────────────────────────────────────────────────────
-- Partitioned by day. Dropping an expired partition is instant; deleting forty
-- million rows is an outage.
--
-- Idempotency is the primary key, not application logic. WebSocket delivery is
-- at-least-once and a reconnect replays from the cursor, so a duplicated swap
-- would otherwise inflate volume and, worse, corrupt a wallet's realized P&L
-- and therefore its published rank.

create table swaps (
  block_time   timestamptz  not null,
  block_number bigint       not null,
  tx_hash      bytea        not null,
  log_index    integer      not null,
  pool_id      bigint       not null,
  -- The real trader, resolved past routers. A raw `sender` is often a router
  -- contract and ranking routers would be worse than useless.
  trader       bytea        not null,
  side         trade_side   not null,   -- relative to the pool's base token
  amount_base  numeric(78,0) not null,
  amount_quote numeric(78,0) not null,
  price_usd    numeric(36,18),
  value_usd    numeric(24,6),
  gas_used_wei numeric(78,0),
  -- Set once the swap has been folded into a position, so the P&L engine can
  -- resume without rescanning.
  folded       boolean      not null default false,
  primary key (block_time, tx_hash, log_index)
) partition by range (block_time);

create index swaps_trader_time_idx on swaps (trader, block_time desc);
create index swaps_pool_time_idx   on swaps (pool_id, block_time desc);
create index swaps_unfolded_idx    on swaps (block_time) where not folded;

-- ── liquidity events ───────────────────────────────────────────────────────
-- Drives the liquidity-pull warning, which is the highest-value alert in the
-- product and the thing most tools bury.

create table liquidity_events (
  block_time    timestamptz  not null,
  tx_hash       bytea        not null,
  log_index     integer      not null,
  pool_id       bigint       not null,
  provider      bytea,
  delta_base    numeric(78,0) not null,  -- negative on removal
  delta_quote   numeric(78,0) not null,
  liq_usd_after numeric(24,6),
  primary key (block_time, tx_hash, log_index)
) partition by range (block_time);

create index liquidity_events_pool_idx on liquidity_events (pool_id, block_time desc);

-- ── durable cursors ────────────────────────────────────────────────────────
-- A restart resumes rather than replaying. last_block_hash lets each batch
-- verify its parent, which is how a sequencer rollback is detected: on a
-- mismatch we delete rows above the divergence point and re-ingest. Cheap,
-- because every table here is keyed by block.

create table indexer_cursors (
  stream          text primary key,
  last_block      bigint not null,
  last_block_hash bytea,
  updated_at      timestamptz not null default now()
);

-- ── RPC budget ledger ──────────────────────────────────────────────────────
-- The free Alchemy tier is generous but finite, and an unbounded backfill is
-- exactly how it dies. The worker records what it spends per hour and refuses
-- to exceed the budget, logging the shortfall instead of silently continuing.

create table rpc_usage (
  hour_bucket   timestamptz primary key,
  compute_units bigint not null default 0,
  requests      integer not null default 0
);

-- ── partition management ───────────────────────────────────────────────────
-- Called nightly by the prune job. Creates tomorrow's partitions ahead of time
-- so an insert can never arrive without a home, and drops expired ones.

create or replace function ensure_partition(
  parent text,
  day    date
) returns void language plpgsql as $$
declare
  part text := format('%s_%s', parent, to_char(day, 'YYYYMMDD'));
begin
  if not exists (select 1 from pg_class where relname = part) then
    execute format(
      'create table %I partition of %I for values from (%L) to (%L)',
      part, parent, day, day + 1
    );
  end if;
end $$;

create or replace function drop_partitions_before(
  parent text,
  cutoff date
) returns integer language plpgsql as $$
declare
  r record;
  dropped integer := 0;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_inherits i on i.inhrelid = c.oid
    join pg_class p on p.oid = i.inhparent
    where p.relname = parent
      and c.relname < format('%s_%s', parent, to_char(cutoff, 'YYYYMMDD'))
  loop
    execute format('drop table %I', r.relname);
    dropped := dropped + 1;
  end loop;
  return dropped;
end $$;
