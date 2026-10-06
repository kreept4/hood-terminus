-- ════════════════════════════════════════════════════════════════════════
-- Our own index of every pool on the chain.
--
-- Why this exists, plainly: GeckoTerminal serves five pages before it starts
-- refusing, which is a hundred pools. The Uniswap factory has emitted 3,414
-- `PoolCreated` events on this chain. So the product was showing three percent
-- of the market it claims to cover, and no amount of tuning our own code fixes
-- that, because the ceiling belongs to somebody else's free tier.
--
-- The pool list is free: it is an event log on a public chain and reading it
-- costs one pass. What a market data provider actually sells is the layer on
-- top, price and volume and liquidity. Indexing the list ourselves means the
-- provider stops being the ceiling on what we can show, and stays useful for
-- the part it is good at.
--
-- What this table is NOT: it holds no prices, no volume and no history. It is
-- a directory. Pricing is read from the chain on demand, and trade history
-- needs the swap watcher that 0002 describes and nobody has written yet.
--
-- Public read, because a pool address is public. Written only by the backfill
-- with the service role key.
--
-- Run this in the Supabase SQL Editor after 0005_token_metadata.sql.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.pools (
  -- Lowercased hex, matching how every other address in this schema is stored.
  address text primary key,
  token0 text not null,
  token1 text not null,
  fee int not null,
  created_block bigint not null,

  -- Resolved once, from the tokens themselves. Nullable because a token that
  -- does not implement `symbol()` is not a reason to lose the pool: the
  -- address is still real and still tradeable.
  token0_symbol text,
  token1_symbol text,
  token0_decimals smallint,
  token1_decimals smallint,

  indexed_at timestamptz not null default now()
);

-- Newest first is the commonest read, and the one the launch feed depends on.
create index if not exists pools_block_idx on public.pools (created_block desc);

-- Search by ticker. Both sides, because a pair is named by either of them.
create index if not exists pools_symbol0_idx on public.pools (lower(token0_symbol));
create index if not exists pools_symbol1_idx on public.pools (lower(token1_symbol));

-- Every pool a given token trades in, which is what a token page asks for.
create index if not exists pools_token0_idx on public.pools (token0);
create index if not exists pools_token1_idx on public.pools (token1);

alter table public.pools enable row level security;

-- Readable by anyone. This is public chain data and the whole point is to stop
-- being rate limited on our way to it.
drop policy if exists "pools are public" on public.pools;
create policy "pools are public"
  on public.pools for select
  to anon, authenticated
  using (true);

-- No insert or update policy. The backfill uses the service role key, which
-- bypasses RLS, so there is no path for a request to write here.

-- ── Where the backfill left off ─────────────────────────────────────────
--
-- One row, so a re-run resumes rather than rescanning six million blocks.
create table if not exists public.index_cursor (
  name text primary key,
  block_number bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.index_cursor enable row level security;
-- Internal only. Nothing outside the backfill has any reason to read it.
