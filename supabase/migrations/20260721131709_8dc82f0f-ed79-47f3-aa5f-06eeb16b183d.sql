
-- 1. Schema extensions
ALTER TABLE public.draft_rooms
  ADD COLUMN IF NOT EXISTS draft_mode text NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS layout_preference text,
  ADD COLUMN IF NOT EXISTS clock_running boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clock_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS clock_elapsed_ms integer NOT NULL DEFAULT 0;

ALTER TABLE public.draft_rooms
  DROP CONSTRAINT IF EXISTS draft_rooms_draft_mode_check;
ALTER TABLE public.draft_rooms
  ADD CONSTRAINT draft_rooms_draft_mode_check CHECK (draft_mode IN ('online','offline'));

ALTER TABLE public.draft_participants
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS share_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS draft_participants_share_token_key
  ON public.draft_participants(share_token);

-- 2. Share-token lookup for public roster pages (SECURITY DEFINER bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.get_room_id_by_share_token(_token uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT room_id FROM public.draft_participants WHERE share_token = _token LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_room_snapshot(_token uuid)
RETURNS TABLE (
  room_id uuid,
  room_name text,
  status text,
  draft_mode text,
  team_count smallint,
  rounds smallint,
  current_pick_number int,
  participant_id uuid,
  team_name text,
  draft_position smallint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id, r.name, r.status, r.draft_mode, r.team_count, r.rounds, r.current_pick_number,
    p.id, p.team_name, p.draft_position
  FROM public.draft_participants p
  JOIN public.draft_rooms r ON r.id = p.room_id
  WHERE p.share_token = _token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_room_picks(_token uuid)
RETURNS SETOF public.draft_picks
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dp.*
  FROM public.draft_picks dp
  WHERE dp.room_id = (SELECT room_id FROM public.draft_participants WHERE share_token = _token LIMIT 1)
  ORDER BY dp.pick_number ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_public_room_participants(_token uuid)
RETURNS TABLE (
  id uuid,
  team_name text,
  draft_position smallint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.team_name, p.draft_position
  FROM public.draft_participants p
  WHERE p.room_id = (SELECT room_id FROM public.draft_participants WHERE share_token = _token LIMIT 1)
  ORDER BY p.draft_position ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_room_id_by_share_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_room_snapshot(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_room_picks(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_room_participants(uuid) TO anon, authenticated;

-- 3. Offline pick RPC (host only; drafts for a specific team, bypasses turn-user check)
CREATE OR REPLACE FUNCTION public.make_offline_pick(
  _room_id uuid,
  _player_id text,
  _player_name text,
  _player_position text,
  _player_team text
)
RETURNS public.draft_picks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _round smallint;
  _team_idx smallint;
  _participant_user_id uuid;
  _total_picks int;
  _new_pick public.draft_picks;
  _loose text;
  _canonical_id text;
  _canonical_name text;
  _canonical_pos text;
  _canonical_team text;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.draft_mode <> 'offline' THEN RAISE EXCEPTION 'Not an offline draft'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can draft'; END IF;
  IF _room.status <> 'drafting' THEN RAISE EXCEPTION 'Draft is not active'; END IF;

  _total_picks := _room.team_count * _room.rounds;
  IF _room.current_pick_number > _total_picks THEN RAISE EXCEPTION 'Draft already complete'; END IF;

  _round := ((_room.current_pick_number - 1) / _room.team_count) + 1;
  _team_idx := public.pick_team_for(_room, _room.current_pick_number);

  _loose := regexp_replace(lower(COALESCE(_player_id, '')), '[^a-z0-9]', '', 'g');
  _canonical_id := _player_id;
  _canonical_name := _player_name;
  _canonical_pos := _player_position;
  _canonical_team := _player_team;

  IF _loose <> '' THEN
    SELECT p.player_key, p.full_name, p.position, p.team_abbreviation
      INTO _canonical_id, _canonical_name, _canonical_pos, _canonical_team
    FROM public.players p
    WHERE p.loose_key = _loose
    LIMIT 1;

    IF _canonical_id IS NULL THEN
      _canonical_id := _player_id;
      _canonical_name := _player_name;
      _canonical_pos := _player_position;
      _canonical_team := _player_team;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.draft_picks
    WHERE room_id = _room_id
      AND regexp_replace(lower(player_id), '[^a-z0-9]', '', 'g') = _loose
  ) THEN
    RAISE EXCEPTION 'That player is already drafted in this room';
  END IF;

  SELECT user_id INTO _participant_user_id
  FROM public.draft_participants
  WHERE room_id = _room_id AND draft_position = _team_idx;

  INSERT INTO public.draft_picks (
    room_id, pick_number, round, team_idx, user_id,
    player_id, player_name, player_position, player_team, was_autopick
  ) VALUES (
    _room_id, _room.current_pick_number, _round, _team_idx, _participant_user_id,
    _canonical_id, _canonical_name, _canonical_pos, _canonical_team, false
  )
  RETURNING * INTO _new_pick;

  BEGIN
    PERFORM public.advance_past_keepers(_room_id);
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  RETURN _new_pick;
END;
$$;

GRANT EXECUTE ON FUNCTION public.make_offline_pick(uuid, text, text, text, text) TO authenticated;

-- 4. Undo last pick (host only, offline only)
CREATE OR REPLACE FUNCTION public.undo_last_offline_pick(_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _last_pick_number int;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.draft_mode <> 'offline' THEN RAISE EXCEPTION 'Not an offline draft'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can undo'; END IF;

  SELECT MAX(pick_number) INTO _last_pick_number
  FROM public.draft_picks WHERE room_id = _room_id;

  IF _last_pick_number IS NULL THEN RETURN; END IF;

  DELETE FROM public.draft_picks
  WHERE room_id = _room_id AND pick_number = _last_pick_number;

  DELETE FROM public.draft_pick_assignments
  WHERE room_id = _room_id AND pick_number = _last_pick_number;

  UPDATE public.draft_rooms
  SET current_pick_number = _last_pick_number,
      status = CASE WHEN status = 'complete' THEN 'drafting' ELSE status END,
      completed_at = CASE WHEN status = 'complete' THEN NULL ELSE completed_at END
  WHERE id = _room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_last_offline_pick(uuid) TO authenticated;

-- 5. Host-controlled shared timer RPCs
CREATE OR REPLACE FUNCTION public.set_offline_clock(_room_id uuid, _running boolean, _reset boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _new_elapsed integer;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can control the clock'; END IF;

  IF _reset THEN
    UPDATE public.draft_rooms
    SET clock_running = false, clock_started_at = NULL, clock_elapsed_ms = 0
    WHERE id = _room_id;
    RETURN;
  END IF;

  IF _running AND NOT _room.clock_running THEN
    UPDATE public.draft_rooms
    SET clock_running = true, clock_started_at = now()
    WHERE id = _room_id;
  ELSIF (NOT _running) AND _room.clock_running THEN
    _new_elapsed := _room.clock_elapsed_ms
      + COALESCE(EXTRACT(EPOCH FROM (now() - _room.clock_started_at)) * 1000, 0)::int;
    UPDATE public.draft_rooms
    SET clock_running = false, clock_started_at = NULL, clock_elapsed_ms = _new_elapsed
    WHERE id = _room_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_offline_clock(uuid, boolean, boolean) TO authenticated;
