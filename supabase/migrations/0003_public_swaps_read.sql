-- Swap data is public on-chain data — same status as anything visible on a
-- block explorer. No reason to restrict it from anon, only from writes
-- (already enforced: no insert/update/delete grants exist on this table).
grant select on public.swaps to anon, authenticated;

drop policy if exists "swaps_public_read" on public.swaps;
create policy "swaps_public_read"
  on public.swaps for select
  using (true);
