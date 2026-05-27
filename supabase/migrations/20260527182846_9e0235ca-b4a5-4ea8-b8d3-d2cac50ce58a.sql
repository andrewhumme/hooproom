CREATE OR REPLACE FUNCTION public.draft_rooms_validate_auction()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  _total_slots int;
begin
  if new.draft_format in ('auction', 'auction_slow') then
    if new.auction_budget is null or new.auction_budget < 10 or new.auction_budget > 100000 then
      raise exception 'auction_budget must be between 10 and 100000';
    end if;
    if new.auction_min_bid is null or new.auction_min_bid < 1 or new.auction_min_bid > new.auction_budget then
      raise exception 'auction_min_bid must be between 1 and auction_budget';
    end if;
    if new.auction_bid_clock_sec is null or new.auction_bid_clock_sec < 10 then
      raise exception 'auction_bid_clock_sec must be at least 10 seconds';
    end if;
    if new.draft_format = 'auction_slow'
       and new.auction_antisnipe_threshold_sec is not null
       and (new.auction_antisnipe_threshold_sec < 10
            or new.auction_antisnipe_threshold_sec > new.auction_bid_clock_sec) then
      raise exception 'auction_antisnipe_threshold_sec must be between 10 and auction_bid_clock_sec';
    end if;
    if new.auction_max_concurrent_nominations is null
       or new.auction_max_concurrent_nominations < 1
       or new.auction_max_concurrent_nominations > 400 then
      raise exception 'auction_max_concurrent_nominations must be between 1 and 400';
    end if;
    if new.auction_concurrent_per_team is null
       or new.auction_concurrent_per_team < 1
       or new.auction_concurrent_per_team > 20 then
      raise exception 'auction_concurrent_per_team must be between 1 and 20';
    end if;
    _total_slots := public.auction_total_slots(new);
    if new.auction_nominations_per_team is not null then
      if new.auction_nominations_per_team < _total_slots then
        raise exception 'auction_nominations_per_team must be at least roster size (%) so every team can fill their roster', _total_slots;
      end if;
      if new.auction_nominations_per_team > 1000 then
        raise exception 'auction_nominations_per_team too large';
      end if;
    end if;
  end if;
  return new;
end;
$function$;