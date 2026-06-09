CREATE OR REPLACE FUNCTION public.draft_rooms_sync_rounds()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.rounds := coalesce(new.slots_pg,0) + coalesce(new.slots_sg,0)
              + coalesce(new.slots_sf,0) + coalesce(new.slots_pf,0)
              + coalesce(new.slots_c,0)  + coalesce(new.slots_g,0)
              + coalesce(new.slots_f,0)  + coalesce(new.slots_flx,0)
              + coalesce(new.slots_bn,0);
  if new.rounds < 1 then
    raise exception 'Roster must have at least 1 slot';
  end if;
  new.reversal_rounds := coalesce((
    select array_agg(distinct r order by r)
    from unnest(new.reversal_rounds) as r
    where r >= 2 and r <= new.rounds - 1
  ), '{}'::smallint[]);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.auction_total_slots(_room public.draft_rooms)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(_room.slots_pg,0) + coalesce(_room.slots_sg,0)
       + coalesce(_room.slots_sf,0) + coalesce(_room.slots_pf,0)
       + coalesce(_room.slots_c,0)  + coalesce(_room.slots_g,0)
       + coalesce(_room.slots_f,0)  + coalesce(_room.slots_flx,0)
       + coalesce(_room.slots_bn,0);
$function$;

-- Recompute rounds for all waiting rooms so existing rooms reflect the true roster size.
UPDATE public.draft_rooms
SET rounds = coalesce(slots_pg,0) + coalesce(slots_sg,0)
           + coalesce(slots_sf,0) + coalesce(slots_pf,0)
           + coalesce(slots_c,0)  + coalesce(slots_g,0)
           + coalesce(slots_f,0)  + coalesce(slots_flx,0)
           + coalesce(slots_bn,0)
WHERE status = 'waiting';