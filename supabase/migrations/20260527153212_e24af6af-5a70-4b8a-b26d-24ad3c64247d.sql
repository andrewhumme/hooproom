
-- Per-team concurrent nominations: each team can have N active nominations at once.
ALTER TABLE public.draft_rooms
  ADD COLUMN IF NOT EXISTS auction_concurrent_per_team smallint NOT NULL DEFAULT 1;

-- Update validator to enforce range and not exceed room-wide cap.
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
       or new.auction_max_concurrent_nominations > 20 then
      raise exception 'auction_max_concurrent_nominations must be between 1 and 20';
    end if;
    if new.auction_concurrent_per_team is null
       or new.auction_concurrent_per_team < 1
       or new.auction_concurrent_per_team > 20 then
      raise exception 'auction_concurrent_per_team must be between 1 and 20';
    end if;
    if new.auction_concurrent_per_team > new.auction_max_concurrent_nominations then
      raise exception 'auction_concurrent_per_team (%) cannot exceed auction_max_concurrent_nominations (%)',
        new.auction_concurrent_per_team, new.auction_max_concurrent_nominations;
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

-- Allow a team to be nominator if they have <auction_concurrent_per_team active noms.
CREATE OR REPLACE FUNCTION public.auction_next_nominator(_room_id uuid)
 RETURNS smallint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _room public.draft_rooms;
  _total_slots int;
  _completed int;
  _round int;
  _slot_in_round int;
  _team_count smallint;
  _candidate smallint;
  _attempts int := 0;
  _picks_for_team int;
  _team_active int;
  _team_total_noms int;
  _quota smallint;
  _per_team smallint;
begin
  select * into _room from public.draft_rooms where id = _room_id;
  if _room is null then return null; end if;
  _team_count := _room.team_count;
  _total_slots := public.auction_total_slots(_room);
  _quota := _room.auction_nominations_per_team;
  _per_team := coalesce(_room.auction_concurrent_per_team, 1);

  select count(*) into _completed
  from public.auction_nominations
  where room_id = _room_id
    and status in ('active', 'awarded');

  loop
    _round := (_completed / _team_count);
    _slot_in_round := (_completed % _team_count);
    if (_round % 2) = 0 then
      _candidate := (_slot_in_round + 1)::smallint;
    else
      _candidate := (_team_count - _slot_in_round)::smallint;
    end if;

    select count(*) into _picks_for_team from public.draft_picks
      where room_id = _room_id and team_idx = _candidate;
    select count(*) into _team_active from public.auction_nominations
      where room_id = _room_id and nominator_team_idx = _candidate and status = 'active';
    select count(*) into _team_total_noms from public.auction_nominations
      where room_id = _room_id and nominator_team_idx = _candidate
        and status in ('active','awarded');

    if _picks_for_team < _total_slots
       and _team_active < _per_team
       and (_quota is null or _team_total_noms < _quota) then
      return _candidate;
    end if;

    _completed := _completed + 1;
    _attempts := _attempts + 1;
    if _attempts > _team_count * (_total_slots + 2) then
      return null;
    end if;
  end loop;
end;
$function$;

-- Allow up to per-team concurrent noms in auction_nominate.
CREATE OR REPLACE FUNCTION public.auction_nominate(_room_id uuid, _player_id text, _player_name text, _player_position text, _player_team text, _opening_bid integer)
 RETURNS auction_nominations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _room public.draft_rooms;
  _next_team smallint;
  _expected_user uuid;
  _total_slots int;
  _team_picks int;
  _team_spent int;
  _remaining_slots int;
  _max_affordable int;
  _nom public.auction_nominations;
  _nomination_number int;
  _active_count int;
  _team_active int;
  _team_total_noms int;
  _per_team smallint;
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then raise exception 'Room not found'; end if;
  if _room.status <> 'drafting' then raise exception 'Auction not active'; end if;
  if _room.draft_format not in ('auction','auction_slow') then
    raise exception 'Not an auction draft';
  end if;
  _per_team := coalesce(_room.auction_concurrent_per_team, 1);

  select count(*) into _active_count
  from public.auction_nominations
  where room_id = _room_id and status = 'active';
  if _active_count >= coalesce(_room.auction_max_concurrent_nominations, 1) then
    raise exception 'Max concurrent nominations reached (% of %)',
      _active_count, _room.auction_max_concurrent_nominations;
  end if;

  _next_team := public.auction_next_nominator(_room_id);
  if _next_team is null then raise exception 'No team available to nominate'; end if;

  select user_id into _expected_user
  from public.draft_participants
  where room_id = _room_id and draft_position = _next_team;

  if _expected_user is null or _expected_user <> auth.uid() then
    raise exception 'Not your turn to nominate';
  end if;

  select count(*) into _team_active from public.auction_nominations
    where room_id = _room_id and nominator_team_idx = _next_team and status = 'active';
  if _team_active >= _per_team then
    raise exception 'You already have % active nomination(s) — wait for one to be awarded', _team_active;
  end if;

  if _room.auction_nominations_per_team is not null then
    select count(*) into _team_total_noms from public.auction_nominations
      where room_id = _room_id and nominator_team_idx = _next_team
        and status in ('active','awarded');
    if _team_total_noms >= _room.auction_nominations_per_team then
      raise exception 'You have used all % nominations', _room.auction_nominations_per_team;
    end if;
  end if;

  if exists (select 1 from public.draft_picks
             where room_id = _room_id and player_id = _player_id) then
    raise exception 'Player already drafted';
  end if;
  if exists (select 1 from public.auction_nominations
             where room_id = _room_id and player_id = _player_id and status = 'active') then
    raise exception 'Player already on the block';
  end if;

  _total_slots := public.auction_total_slots(_room);
  select count(*) into _team_picks from public.draft_picks
    where room_id = _room_id and team_idx = _next_team;
  select coalesce(sum(coalesce(auction_price,0)),0) into _team_spent
    from public.draft_picks
    where room_id = _room_id and team_idx = _next_team;

  _remaining_slots := _total_slots - _team_picks;
  if _remaining_slots <= 0 then raise exception 'Roster full'; end if;

  if _opening_bid < _room.auction_min_bid then
    raise exception 'Opening bid below minimum (%)', _room.auction_min_bid;
  end if;

  _max_affordable := (_room.auction_budget - _team_spent) - (_remaining_slots - 1);
  if _opening_bid > _max_affordable then
    raise exception 'Bid exceeds max affordable ($%)', _max_affordable;
  end if;

  _nomination_number := coalesce((select max(nomination_number) from public.auction_nominations
                                   where room_id = _room_id), 0) + 1;

  insert into public.auction_nominations(
    room_id, nomination_number, nominator_team_idx,
    player_id, player_name, player_position, player_team,
    opening_bid, current_bid, current_bidder_team_idx, current_bidder_user_id,
    deadline, status
  ) values (
    _room_id, _nomination_number, _next_team,
    _player_id, _player_name, _player_position, _player_team,
    _opening_bid, _opening_bid, _next_team, _expected_user,
    now() + (_room.auction_bid_clock_sec || ' seconds')::interval, 'active'
  ) returning * into _nom;

  insert into public.auction_bids(room_id, nomination_id, team_idx, user_id, amount, is_opening)
  values (_room_id, _nom.id, _next_team, _expected_user, _opening_bid, true);

  return _nom;
end;
$function$;
