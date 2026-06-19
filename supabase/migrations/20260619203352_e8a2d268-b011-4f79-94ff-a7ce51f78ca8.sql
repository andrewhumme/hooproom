
-- Host-only draft control RPCs: undo picks, replace pick player, adjust clock, force skip.

-- ============ host_undo_pick ============
-- Removes the last N picks (default 1), rewinds the room's current_pick_number,
-- resets the clock, and restores status to 'drafting' if the draft was complete.
-- Works for both snake and auction drafts. The auction budget is derived from
-- draft_picks rows, so deleting picks naturally refunds the spent money.
create or replace function public.host_undo_pick(_room_id uuid, _count int default 1)
returns public.draft_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  _room public.draft_rooms;
  _deleted int;
  _max_pick int;
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then raise exception 'Room not found'; end if;
  if _room.host_user_id <> auth.uid() then raise exception 'Only the host can undo picks'; end if;
  if _room.status not in ('drafting','paused','complete') then
    raise exception 'Draft has not started';
  end if;
  if _count < 1 then raise exception 'Count must be >= 1'; end if;

  -- Delete the most recent _count picks for this room.
  with target as (
    select id from public.draft_picks
    where room_id = _room_id
    order by pick_number desc
    limit _count
  )
  delete from public.draft_picks
  where id in (select id from target);
  get diagnostics _deleted = row_count;

  if _deleted = 0 then raise exception 'No picks to undo'; end if;

  select coalesce(max(pick_number), 0) into _max_pick
  from public.draft_picks where room_id = _room_id;

  update public.draft_rooms
  set status = case when status = 'paused' then 'paused' else 'drafting' end,
      completed_at = null,
      current_pick_number = _max_pick + 1,
      pick_deadline = case
        when status = 'paused' then null
        else now() + (pick_clock_sec || ' seconds')::interval
      end
  where id = _room_id
  returning * into _room;

  return _room;
end;
$$;

revoke all on function public.host_undo_pick(uuid, int) from public, anon;
grant execute on function public.host_undo_pick(uuid, int) to authenticated;


-- ============ host_replace_pick ============
-- Swaps the player on an existing pick without changing turn order or budget.
-- Validates that the new player isn't already on someone else's pick in the room.
create or replace function public.host_replace_pick(
  _room_id uuid,
  _pick_id uuid,
  _player_id text,
  _player_name text,
  _player_position text,
  _player_team text
)
returns public.draft_picks
language plpgsql
security definer
set search_path = public
as $$
declare
  _room public.draft_rooms;
  _pick public.draft_picks;
  _conflict_id uuid;
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then raise exception 'Room not found'; end if;
  if _room.host_user_id <> auth.uid() then raise exception 'Only the host can replace picks'; end if;

  select * into _pick from public.draft_picks
  where id = _pick_id and room_id = _room_id for update;
  if _pick is null then raise exception 'Pick not found'; end if;

  -- Block if the new player is already on a DIFFERENT pick.
  select id into _conflict_id from public.draft_picks
  where room_id = _room_id and player_id = _player_id and id <> _pick_id
  limit 1;
  if _conflict_id is not null then
    raise exception 'That player is already drafted in this room';
  end if;

  update public.draft_picks
  set player_id = _player_id,
      player_name = _player_name,
      player_position = _player_position,
      player_team = _player_team
  where id = _pick_id
  returning * into _pick;

  return _pick;
end;
$$;

revoke all on function public.host_replace_pick(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.host_replace_pick(uuid, uuid, text, text, text, text) to authenticated;


-- ============ host_adjust_clock ============
-- Adds (positive) or removes (negative) seconds from the active clock(s).
-- Snake: shifts pick_deadline. Auction: shifts every active nomination deadline.
-- Refuses to push a deadline into the past (minimum +1s from now).
create or replace function public.host_adjust_clock(_room_id uuid, _delta_sec int)
returns public.draft_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  _room public.draft_rooms;
  _interval interval;
  _floor timestamptz;
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then raise exception 'Room not found'; end if;
  if _room.host_user_id <> auth.uid() then raise exception 'Only the host can adjust the clock'; end if;
  if _room.status <> 'drafting' then raise exception 'Draft is not running'; end if;
  if _delta_sec = 0 then return _room; end if;

  _interval := (_delta_sec || ' seconds')::interval;
  _floor := now() + interval '1 second';

  if _room.pick_deadline is not null then
    update public.draft_rooms
    set pick_deadline = greatest(_floor, pick_deadline + _interval)
    where id = _room_id
    returning * into _room;
  end if;

  update public.auction_nominations
  set deadline = greatest(_floor, deadline + _interval)
  where room_id = _room_id and status = 'active';

  return _room;
end;
$$;

revoke all on function public.host_adjust_clock(uuid, int) from public, anon;
grant execute on function public.host_adjust_clock(uuid, int) to authenticated;


-- ============ host_force_clock_expire ============
-- Snake: collapses the current pick clock to now() so the autopick path fires.
-- Auction: collapses all active nomination deadlines so auction_award_due awards them.
create or replace function public.host_force_clock_expire(_room_id uuid)
returns public.draft_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  _room public.draft_rooms;
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then raise exception 'Room not found'; end if;
  if _room.host_user_id <> auth.uid() then raise exception 'Only the host can skip picks'; end if;
  if _room.status <> 'drafting' then raise exception 'Draft is not running'; end if;

  if _room.pick_deadline is not null then
    update public.draft_rooms
    set pick_deadline = now()
    where id = _room_id
    returning * into _room;
  end if;

  update public.auction_nominations
  set deadline = now()
  where room_id = _room_id and status = 'active';

  return _room;
end;
$$;

revoke all on function public.host_force_clock_expire(uuid) from public, anon;
grant execute on function public.host_force_clock_expire(uuid) to authenticated;
