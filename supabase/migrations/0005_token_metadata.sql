-- Artwork and blurb for launched tokens.
--
-- The launchpad stores no metadata URI, deliberately: a string field on every
-- launch is permanent, costs gas forever, and points at a host that will
-- outlive neither the token nor its owner's hosting bill. So the chain holds
-- what must be trustless (who created it, what it is worth, who owns the fees)
-- and this holds what is merely presentational.
--
-- That split is the reason the app never blocks on this table. A token with no
-- row here renders a monogram and trades exactly the same.

create table if not exists public.token_metadata (
  -- The token contract, lowercase. Not a generated id: the address already
  -- identifies the row uniquely and is what every caller has in hand.
  token_address text primary key,
  -- Who is allowed to have written this, checked at insert time against the
  -- launchpad. Kept so a later edit can be authorised the same way.
  creator_address text not null,
  image_url text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint token_address_is_hex check (token_address ~ '^0x[0-9a-f]{40}$'),
  constraint creator_address_is_hex check (creator_address ~ '^0x[0-9a-f]{40}$'),
  -- A blurb, not an essay. Matches the form's own limit.
  constraint description_length check (description is null or length(description) <= 140)
);

alter table public.token_metadata enable row level security;

-- Readable by anyone. It is artwork for a public token; there is nothing here
-- that is not already on a screener.
grant select on public.token_metadata to anon, authenticated;

drop policy if exists "token_metadata_public_read" on public.token_metadata;
create policy "token_metadata_public_read"
  on public.token_metadata for select
  using (true);

-- No insert, update or delete grants to anon on purpose. Writes go through the
-- server route, which verifies against the launchpad that the caller actually
-- created the token before using the service role. Granting insert here would
-- let anyone set the artwork on anyone's token.

create index if not exists token_metadata_creator_idx
  on public.token_metadata (creator_address);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- This table was created after the first token launched, and that launch's
-- upload is still sitting in the bucket with nothing pointing at it. The row
-- below is that file, reattached. Harmless to run on a fresh database: the
-- token address simply will not exist and nothing else references this row.
insert into public.token_metadata (token_address, creator_address, image_url)
values (
  '0xdc345daf1b46bc189b574327f061498e7af8b5bf',
  '0xa6b5dae2bce1d4414a517a67948a0cb1f6b3a800',
  'https://acciaynabypxiutcwwtx.supabase.co/storage/v1/object/public/token-images/mtup6c5r-e86df9af-be7b-43aa-bcfa-a4aea1d83ad0.png'
)
on conflict (token_address) do update
  set image_url = excluded.image_url,
      updated_at = now();
