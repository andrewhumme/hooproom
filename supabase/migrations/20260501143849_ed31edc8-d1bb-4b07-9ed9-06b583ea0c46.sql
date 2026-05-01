-- ============ auction_nominations ============
create table if not exists public.auction_nominations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.draft_rooms(id) on delete cascade,
  nomination_number integer not null,
  nominator_team_idx smallint not null,
  player_id text not null,
  player_name text not null,
  player_position text,
  player_team text,
  opening_bid integer not null,
  current_bid integer not null,
  current_bidder_team_idx smallint not null,
  current_bidder_user_id uuid,
  deadline timestamptz not null,
  status text not null default 'active', -- active | awarded | cancelled
  created_at timestamptz not null default now(),
  awarded_at timestamptz,
  unique (room_id, nomination_number)
);

create index if not exists auction_nominations_room_status_idx
  on public.auction_nominations(room_id, status);

alter table public.auction_nominations enable row level security;

create policy "Authed users can view nominations"
  on public.auction_nominations for select
  to authenticated using (true);

-- No direct INSERT/UPDATE/DELETE policies; only SECURITY DEFINER funcs mutate.

-- ============ auction_bids (history) ============
create table if not exists public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.draft_rooms(id) on delete cascade,
  nomination_id uuid not null references public.auction_nominations(id) on delete cascade,
  team_idx smallint not null,
  user_id uuid,
  amount integer not null,
  is_opening boolean not null default false,
  bid_at timestamptz not null default now()
);

create index if not exists auction_bids_nomination_idx
  on public.auction_bids(nomination_id, bid_at desc);

alter table public.auction_bids enable row level security;

create policy "Authed users can view bids"
  on public.auction_bids for select
  to authenticated using (true);

-- ============ helper: total roster slots per room ============
create or replace function public.auction_total_slots(_room public.draft_rooms)
returns integer
language sql
immutable
as $$
  select coalesce(_room.slots_pg,0) + coalesce(_room.slots_sg,0)
       + coalesce(_room.slots_sf,0) + coalesce(_room.slots_pf,0)
       + coalesce(_room.slots_c,0)  + coalesce(_room.slots_flx,0)
       + coalesce(_room.slots_bn,0);
$$;

-- ============ auction_start ============
create or replace function public.auction_start(_room_id uuid)
returns public.draft_rooms
language plpgsql
security definer
set search_path = public
as $function$
declare
  _room public.draft_rooms;
  _participant_count int;
  _first_team smallint;
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then raise exception 'Room not found'; end if;
  if _room.host_user_id <> auth.uid() then raise exception 'Only host can start'; end if;
  if _room.status <> 'waiting' then raise exception 'Draft already started'; end if;
  if _room.draft_format not in ('auction','auction_slow') then
    raise exception 'Not an auction draft';
  end if;

  select count(*) into _participant_count
  from public.draft_participants where room_id = _room_id;
  if _participant_count = 0 then raise exception 'Need at least one participant'; end if;

  -- random draft positions
  with ordered as (
    select id, row_number() over (order by random()) as pos
    from public.draft_participants where room_id = _room_id
  )
  update public.draft_participants p
  set draft_position = o.pos
  from ordered o where p.id = o.id;

  _first_team := 1;

  update public.draft_rooms
  set status = 'drafting',
      current_pick_number = 1,  -- repurposed: counts nominations
      pick_deadline = null,     -- not used in auction; per-nomination deadline lives on nomination row
      started_at = now()
  where id = _room_id
  returning * into _room;

  return _room;
end;
$function$;

-- ============ auction_nominate ============
create or replace function public.auction_nominate(
  _room_id uuid,
  _player_id text,
  _player_name text,
  _player_position text,
  _player_team text,
  _opening_bid integer
)
returns public.auction_nominations
language plpgsql
security definer
set search_path = public
as $function$
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
  _direction smallint;
  _round smallint;
  _slot_in_round smallint;
  _active_count int;
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then raise exception 'Room not found'; end if;
  if _room.status <> 'drafting' then raise exception 'Auction not active'; end if;
  if _room.draft_format not in ('auction','auction_slow') then
    raise exception 'Not an auction draft';
  end if;

  -- Block nomination if there's already an active one in this room
  select count(*) into _active_count
  from public.auction_nominations
  where room_id = _room_id and status = 'active';
  if _active_count > 0 then
    raise exception 'A nomination is already active';
  end if;

  -- Determine current nominator using snake-skip-full
  _next_team := public.auction_next_nominator(_room_id);
  if _next_team is null then
    raise exception 'No team available to nominate';
  end if;

  select user_id into _expected_user
  from public.draft_participants
  where room_id = _room_id and draft_position = _next_team;

  if _expected_user is null or _expected_user <> auth.uid() then
    raise exception 'Not your turn to nominate';
  end if;

  -- Player must not already be drafted
  if exists (select 1 from public.draft_picks
             where room_id = _room_id and player_id = _player_id) then
    raise exception 'Player already drafted';
  end if;

  -- Budget validation for nominator (opening bid is their first bid)
  _total_slots := public.auction_total_slots(_room);
  select count(*) into _team_picks from public.draft_picks
    where room_id = _room_id and team_idx = _next_team;
  select coalesce(sum(amount),0) into _team_spent from public.draft_picks dp
    join public.auction_bids_winning v on v.pick_id = dp.id
    where dp.room_id = _room_id and dp.team_idx = _next_team;

  _remaining_slots := _total_slots - _team_picks;
  if _remaining_slots <= 0 then raise exception 'Roster full'; end if;

  -- min bid >= configured min
  if _opening_bid < _room.auction_min_bid then
    raise exception 'Opening bid below minimum (%)', _room.auction_min_bid;
  end if;

  -- must leave $1 for each remaining slot after this one
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

-- View to get the winning bid amount per pick (used to compute spent budget)
-- We store the winning amount on the pick itself instead, simpler:
-- Add a column to draft_picks to store auction price.
alter table public.draft_picks
  add column if not exists auction_price integer;

-- replace the helper view reference above with a function (we don't actually need the view).
-- Drop placeholder if it slipped in:
drop view if exists public.auction_bids_winning;

-- Rewrite auction_nominate to use draft_picks.auction_price for spent calc
create or replace function public.auction_nominate(
  _room_id uuid,
  _player_id text,
  _player_name text,
  _player_position text,
  _player_team text,
  _opening_bid integer
)
returns public.auction_nominations
language plpgsql
security definer
set search_path = public
as $function$
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
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then raise exception 'Room not found'; end if;
  if _room.status <> 'drafting' then raise exception 'Auction not active'; end if;
  if _room.draft_format not in ('auction','auction_slow') then
    raise exception 'Not an auction draft';
  end if;

  select count(*) into _active_count
  from public.auction_nominations
  where room_id = _room_id and status = 'active';
  if _active_count > 0 then raise exception 'A nomination is already active'; end if;

  _next_team := public.auction_next_nominator(_room_id);
  if _next_team is null then raise exception 'No team available to nominate'; end if;

  select user_id into _expected_user
  from public.draft_participants
  where room_id = _room_id and draft_position = _next_team;

  if _expected_user is null or _expected_user <> auth.uid() then
    raise exception 'Not your turn to nominate';
  end if;

  if exists (select 1 from public.draft_picks
             where room_id = _room_id and player_id = _player_id) then
    raise exception 'Player already drafted';
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

-- ============ auction_next_nominator (snake, skip full rosters) ============
create or replace function public.auction_next_nominator(_room_id uuid)
returns smallint
language plpgsql
stable
security definer
set search_path = public
as $function$
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
begin
  select * into _room from public.draft_rooms where id = _room_id;
  if _room is null then return null; end if;
  _team_count := _room.team_count;
  _total_slots := public.auction_total_slots(_room);

  select count(*) into _completed
  from public.auction_nominations
  where room_id = _room_id and status = 'awarded';

  -- snake order over team_count
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

    if _picks_for_team < _total_slots then
      return _candidate;
    end if;

    _completed := _completed + 1;
    _attempts := _attempts + 1;
    if _attempts > _team_count * _total_slots then
      return null; -- everyone full
    end if;
  end loop;
end;
$function$;

-- ============ auction_bid ============
create or replace function public.auction_bid(
  _nomination_id uuid,
  _amount integer
)
returns public.auction_nominations
language plpgsql
security definer
set search_path = public
as $function$
declare
  _nom public.auction_nominations;
  _room public.draft_rooms;
  _team_idx smallint;
  _user uuid := auth.uid();
  _total_slots int;
  _team_picks int;
  _team_spent int;
  _remaining_slots int;
  _max_affordable int;
  _new_deadline timestamptz;
  _antisnipe_threshold int;
begin
  select * into _nom from public.auction_nominations where id = _nomination_id for update;
  if _nom is null then raise exception 'Nomination not found'; end if;
  if _nom.status <> 'active' then raise exception 'Nomination not active'; end if;
  if now() > _nom.deadline then raise exception 'Bidding closed'; end if;

  select * into _room from public.draft_rooms where id = _nom.room_id;
  if _room.status <> 'drafting' then raise exception 'Draft not active'; end if;

  -- Find bidder team
  select draft_position into _team_idx
  from public.draft_participants
  where room_id = _nom.room_id and user_id = _user;
  if _team_idx is null then raise exception 'You are not in this draft'; end if;

  if _team_idx = _nom.current_bidder_team_idx then
    raise exception 'You already hold the high bid';
  end if;

  if _amount <= _nom.current_bid then
    raise exception 'Bid must exceed current ($%)', _nom.current_bid;
  end if;

  _total_slots := public.auction_total_slots(_room);
  select count(*) into _team_picks from public.draft_picks
    where room_id = _nom.room_id and team_idx = _team_idx;
  if _team_picks >= _total_slots then raise exception 'Your roster is full'; end if;

  select coalesce(sum(coalesce(auction_price,0)),0) into _team_spent
    from public.draft_picks
    where room_id = _nom.room_id and team_idx = _team_idx;

  _remaining_slots := _total_slots - _team_picks;
  _max_affordable := (_room.auction_budget - _team_spent) - (_remaining_slots - 1);
  if _amount > _max_affordable then
    raise exception 'Bid exceeds max affordable ($%)', _max_affordable;
  end if;

  -- Anti-snipe: only for auction_slow with threshold set
  _new_deadline := _nom.deadline;
  if _room.draft_format = 'auction_slow' and _room.auction_antisnipe_threshold_sec is not null then
    _antisnipe_threshold := _room.auction_antisnipe_threshold_sec;
    if extract(epoch from (_nom.deadline - now())) < _antisnipe_threshold then
      _new_deadline := now() + (_room.auction_bid_clock_sec || ' seconds')::interval;
    end if;
  elsif _room.draft_format = 'auction_slow' then
    -- no threshold set => full reset on every bid
    _new_deadline := now() + (_room.auction_bid_clock_sec || ' seconds')::interval;
  end if;

  insert into public.auction_bids(room_id, nomination_id, team_idx, user_id, amount)
  values (_nom.room_id, _nom.id, _team_idx, _user, _amount);

  update public.auction_nominations
  set current_bid = _amount,
      current_bidder_team_idx = _team_idx,
      current_bidder_user_id = _user,
      deadline = _new_deadline
  where id = _nom.id
  returning * into _nom;

  return _nom;
end;
$function$;

-- ============ auction_award_due ============
-- Idempotent: awards all expired active nominations for this room (or all rooms if null).
create or replace function public.auction_award_due(_room_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  _nom public.auction_nominations;
  _room public.draft_rooms;
  _winner_user uuid;
  _pick_number int;
  _team_picks int;
  _round smallint;
  _total_slots int;
  _awarded_count int := 0;
  _everyone_full boolean;
begin
  for _nom in
    select * from public.auction_nominations
    where status = 'active'
      and now() >= deadline
      and (_room_id is null or room_id = _room_id)
    for update
  loop
    select * into _room from public.draft_rooms where id = _nom.room_id for update;
    if _room.status <> 'drafting' then continue; end if;

    select user_id into _winner_user
    from public.draft_participants
    where room_id = _nom.room_id and draft_position = _nom.current_bidder_team_idx;

    select count(*) into _team_picks from public.draft_picks
      where room_id = _nom.room_id and team_idx = _nom.current_bidder_team_idx;
    _round := (_team_picks + 1)::smallint;

    select coalesce(max(pick_number),0) + 1 into _pick_number
      from public.draft_picks where room_id = _nom.room_id;

    insert into public.draft_picks(
      room_id, pick_number, round, team_idx, user_id,
      player_id, player_name, player_position, player_team,
      was_autopick, auction_price
    ) values (
      _nom.room_id, _pick_number, _round, _nom.current_bidder_team_idx, _winner_user,
      _nom.player_id, _nom.player_name, _nom.player_position, _nom.player_team,
      false, _nom.current_bid
    );

    update public.auction_nominations
    set status = 'awarded', awarded_at = now()
    where id = _nom.id;

    _awarded_count := _awarded_count + 1;

    -- Check if everyone is full
    _total_slots := public.auction_total_slots(_room);
    select bool_and(picks_count >= _total_slots) into _everyone_full
    from (
      select team_idx, count(*) as picks_count
      from public.draft_picks
      where room_id = _nom.room_id
      group by team_idx
      having team_idx <= _room.team_count
    ) sub;
    -- Also true only if every team_idx 1..N has full count. Use stricter check:
    select count(*) = _room.team_count into _everyone_full
    from (
      select team_idx
      from public.draft_picks
      where room_id = _nom.room_id
      group by team_idx
      having count(*) >= _total_slots
    ) sub;

    if _everyone_full then
      update public.draft_rooms
      set status = 'complete', completed_at = now(), pick_deadline = null
      where id = _nom.room_id;
    else
      update public.draft_rooms
      set current_pick_number = current_pick_number + 1
      where id = _nom.room_id;
    end if;
  end loop;

  return _awarded_count;
end;
$function$;

-- Realtime
alter publication supabase_realtime add table public.auction_nominations;
alter publication supabase_realtime add table public.auction_bids;