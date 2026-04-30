-- 1. Add reversal_rounds column (array of round numbers that double-pick)
ALTER TABLE public.draft_rooms
  ADD COLUMN IF NOT EXISTS reversal_rounds smallint[] NOT NULL DEFAULT '{}'::smallint[];

-- 2. Trigger: auto-compute rounds = sum of all position slots
CREATE OR REPLACE FUNCTION public.draft_rooms_sync_rounds()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  new.rounds := coalesce(new.slots_pg,0) + coalesce(new.slots_sg,0)
              + coalesce(new.slots_sf,0) + coalesce(new.slots_pf,0)
              + coalesce(new.slots_c,0)  + coalesce(new.slots_flx,0)
              + coalesce(new.slots_bn,0);
  if new.rounds < 1 then
    raise exception 'Roster must have at least 1 slot';
  end if;
  -- Sanitize reversal_rounds: only keep values within 2..rounds-1, dedupe, sort
  new.reversal_rounds := coalesce((
    select array_agg(distinct r order by r)
    from unnest(new.reversal_rounds) as r
    where r >= 2 and r <= new.rounds - 1
  ), '{}'::smallint[]);
  return new;
end;
$$;

DROP TRIGGER IF EXISTS draft_rooms_sync_rounds_trigger ON public.draft_rooms;
CREATE TRIGGER draft_rooms_sync_rounds_trigger
  BEFORE INSERT OR UPDATE OF slots_pg, slots_sg, slots_sf, slots_pf, slots_c, slots_flx, slots_bn, reversal_rounds
  ON public.draft_rooms
  FOR EACH ROW EXECUTE FUNCTION public.draft_rooms_sync_rounds();

-- 3. Update make_pick to support double-pick (3rd-round-reversal style)
-- Logic: We map pick_number -> (round, team_idx) by walking each round in order
-- and applying the snake direction with reversal flips. A reversal at round R
-- means round R+1 starts in the SAME direction round R ended (so the last
-- picker of R picks first in R+1 — a double pick).
CREATE OR REPLACE FUNCTION public.make_pick(
  _room_id uuid,
  _player_id text,
  _player_name text,
  _player_position text,
  _player_team text,
  _autopick boolean DEFAULT false
)
RETURNS draft_picks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  _room public.draft_rooms;
  _round smallint;
  _team_idx smallint;
  _expected_user_id uuid;
  _total_picks int;
  _new_pick public.draft_picks;
  _pick_in_round int;
  _reverse boolean;
  _r smallint;
  _pick_offset int;
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then
    raise exception 'Room not found';
  end if;
  if _room.status <> 'drafting' then
    raise exception 'Draft is not active';
  end if;

  _total_picks := _room.team_count * _room.rounds;
  if _room.current_pick_number > _total_picks then
    raise exception 'Draft already complete';
  end if;

  -- Compute (round, team_idx) for current_pick_number using reversal rules.
  -- Walk round-by-round tracking direction.
  _round := ((_room.current_pick_number - 1) / _room.team_count) + 1;
  _pick_in_round := ((_room.current_pick_number - 1) % _room.team_count) + 1;

  _reverse := false; -- round 1 goes forward
  for _r in 1.._round - 1 loop
    -- If round _r is a reversal round, the next round keeps the SAME direction
    -- (double pick). Otherwise it flips (normal snake).
    if not (_r = ANY(_room.reversal_rounds)) then
      _reverse := not _reverse;
    end if;
  end loop;

  if _reverse then
    _team_idx := _room.team_count - _pick_in_round + 1;
  else
    _team_idx := _pick_in_round;
  end if;

  -- Find the user holding this slot
  select user_id into _expected_user_id
  from public.draft_participants
  where room_id = _room_id and draft_position = _team_idx;

  if not _autopick then
    if _expected_user_id is null then
      raise exception 'Empty seat — autopick required';
    end if;
    if _expected_user_id <> auth.uid() then
      if _room.pick_deadline is null or now() < _room.pick_deadline then
        raise exception 'Not your turn';
      end if;
      _autopick := true;
    end if;
  end if;

  insert into public.draft_picks (
    room_id, pick_number, round, team_idx, user_id,
    player_id, player_name, player_position, player_team, was_autopick
  ) values (
    _room_id, _room.current_pick_number, _round, _team_idx, _expected_user_id,
    _player_id, _player_name, _player_position, _player_team, _autopick
  )
  returning * into _new_pick;

  if _room.current_pick_number >= _total_picks then
    update public.draft_rooms
    set status = 'complete',
        current_pick_number = _room.current_pick_number + 1,
        pick_deadline = null,
        completed_at = now()
    where id = _room_id;
  else
    update public.draft_rooms
    set current_pick_number = _room.current_pick_number + 1,
        pick_deadline = now() + (_room.pick_clock_sec || ' seconds')::interval
    where id = _room_id;
  end if;

  return _new_pick;
end;
$$;