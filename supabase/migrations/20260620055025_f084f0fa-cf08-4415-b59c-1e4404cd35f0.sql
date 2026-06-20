-- 1. Drop the strict (room_id, player_id) unique constraint so we can rewrite
--    legacy player IDs to their canonical form.
ALTER TABLE public.draft_picks
  DROP CONSTRAINT IF EXISTS draft_picks_room_id_player_id_key;

-- 2. Remove duplicate picks (different ID spellings of the same player in the
--    same room). Keep the earliest pick_number, drop the later one(s).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY room_id,
                        regexp_replace(lower(player_id), '[^a-z0-9]', '', 'g')
           ORDER BY pick_number ASC
         ) AS rn
  FROM public.draft_picks
)
DELETE FROM public.draft_picks dp
USING ranked r
WHERE dp.id = r.id AND r.rn > 1;

-- 3. Rewrite remaining picks to their canonical player_key so rosters /
--    dashboards line up.
UPDATE public.draft_picks dp
SET player_id = p.player_key,
    player_name = p.full_name,
    player_position = COALESCE(p.position, dp.player_position),
    player_team = COALESCE(p.team_abbreviation, dp.player_team)
FROM public.players p
WHERE p.loose_key = regexp_replace(lower(dp.player_id), '[^a-z0-9]', '', 'g')
  AND dp.player_id <> p.player_key;

-- 4. Loose-form uniqueness: catches future format mismatches too.
CREATE UNIQUE INDEX IF NOT EXISTS draft_picks_room_loose_player_uniq
  ON public.draft_picks (room_id, (regexp_replace(lower(player_id), '[^a-z0-9]', '', 'g')));

-- 5. make_pick now canonicalizes player_id via players.loose_key and rejects
--    duplicates on the loose form.
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
SET search_path TO 'public'
AS $function$
DECLARE
  _room public.draft_rooms;
  _round smallint;
  _team_idx smallint;
  _expected_user_id uuid;
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
    SELECT 1 FROM public.room_keepers
    WHERE room_id = _room_id
      AND regexp_replace(lower(player_id), '[^a-z0-9]', '', 'g') = _loose
  ) THEN
    RAISE EXCEPTION 'Player is a keeper and cannot be drafted';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.draft_picks
    WHERE room_id = _room_id
      AND regexp_replace(lower(player_id), '[^a-z0-9]', '', 'g') = _loose
  ) THEN
    RAISE EXCEPTION 'That player is already drafted in this room';
  END IF;

  SELECT user_id INTO _expected_user_id
  FROM public.draft_participants
  WHERE room_id = _room_id AND draft_position = _team_idx;

  IF NOT _autopick THEN
    IF _expected_user_id IS NULL THEN
      RAISE EXCEPTION 'Empty seat — autopick required';
    END IF;
    IF _expected_user_id <> auth.uid() THEN
      IF _room.pick_deadline IS NULL OR now() < _room.pick_deadline THEN
        RAISE EXCEPTION 'Not your turn';
      END IF;
      _autopick := true;
    END IF;
  END IF;

  INSERT INTO public.draft_picks (
    room_id, pick_number, round, team_idx, user_id,
    player_id, player_name, player_position, player_team, was_autopick
  ) VALUES (
    _room_id, _room.current_pick_number, _round, _team_idx, _expected_user_id,
    _canonical_id, _canonical_name, _canonical_pos, _canonical_team, _autopick
  )
  RETURNING * INTO _new_pick;

  PERFORM public.advance_past_keepers(_room_id);

  RETURN _new_pick;
END;
$function$;

-- 6. host_replace_pick gets the same canonical-id treatment.
CREATE OR REPLACE FUNCTION public.host_replace_pick(
  _room_id uuid,
  _pick_id uuid,
  _player_id text,
  _player_name text,
  _player_position text,
  _player_team text
)
RETURNS draft_picks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _room public.draft_rooms;
  _pick public.draft_picks;
  _conflict_id uuid;
  _loose text;
  _canonical_id text := _player_id;
  _canonical_name text := _player_name;
  _canonical_pos text := _player_position;
  _canonical_team text := _player_team;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can replace picks'; END IF;

  SELECT * INTO _pick FROM public.draft_picks
    WHERE id = _pick_id AND room_id = _room_id FOR UPDATE;
  IF _pick IS NULL THEN RAISE EXCEPTION 'Pick not found'; END IF;

  _loose := regexp_replace(lower(COALESCE(_player_id, '')), '[^a-z0-9]', '', 'g');

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

  SELECT id INTO _conflict_id FROM public.draft_picks
    WHERE room_id = _room_id
      AND regexp_replace(lower(player_id), '[^a-z0-9]', '', 'g') = _loose
      AND id <> _pick_id
    LIMIT 1;
  IF _conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'That player is already drafted in this room';
  END IF;

  UPDATE public.draft_picks
    SET player_id = _canonical_id,
        player_name = _canonical_name,
        player_position = _canonical_pos,
        player_team = _canonical_team
    WHERE id = _pick_id
    RETURNING * INTO _pick;

  RETURN _pick;
END;
$function$;
