-- Set search_path on helper
create or replace function public.auction_total_slots(_room public.draft_rooms)
returns integer
language sql
immutable
set search_path = public
as $$
  select coalesce(_room.slots_pg,0) + coalesce(_room.slots_sg,0)
       + coalesce(_room.slots_sf,0) + coalesce(_room.slots_pf,0)
       + coalesce(_room.slots_c,0)  + coalesce(_room.slots_flx,0)
       + coalesce(_room.slots_bn,0);
$$;

-- Revoke public execute on all auction security-definer functions; allow only authenticated
revoke all on function public.auction_start(uuid) from public, anon;
grant execute on function public.auction_start(uuid) to authenticated;

revoke all on function public.auction_nominate(uuid, text, text, text, text, integer) from public, anon;
grant execute on function public.auction_nominate(uuid, text, text, text, text, integer) to authenticated;

revoke all on function public.auction_bid(uuid, integer) from public, anon;
grant execute on function public.auction_bid(uuid, integer) to authenticated;

revoke all on function public.auction_next_nominator(uuid) from public, anon;
grant execute on function public.auction_next_nominator(uuid) to authenticated;

-- award_due is callable by both authenticated clients (when their nomination expires)
-- and the cron service-role caller; anon should not be able to call it.
revoke all on function public.auction_award_due(uuid) from public, anon;
grant execute on function public.auction_award_due(uuid) to authenticated, service_role;

revoke all on function public.auction_total_slots(public.draft_rooms) from public, anon;
grant execute on function public.auction_total_slots(public.draft_rooms) to authenticated;