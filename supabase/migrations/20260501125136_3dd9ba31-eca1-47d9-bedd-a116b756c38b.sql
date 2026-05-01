-- Auction configuration
alter table public.draft_rooms
  add column if not exists auction_budget integer not null default 200,
  add column if not exists auction_min_bid integer not null default 1,
  add column if not exists auction_bid_clock_sec integer not null default 30,
  add column if not exists auction_antisnipe_threshold_sec integer;

-- Sanity bounds via validation trigger (CHECK can't reference another column safely across formats)
create or replace function public.draft_rooms_validate_auction()
returns trigger
language plpgsql
set search_path = public
as $$
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
  end if;
  return new;
end;
$$;

drop trigger if exists draft_rooms_validate_auction_trg on public.draft_rooms;
create trigger draft_rooms_validate_auction_trg
  before insert or update on public.draft_rooms
  for each row execute function public.draft_rooms_validate_auction();