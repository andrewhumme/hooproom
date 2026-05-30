
-- 1. New column on draft_picks
ALTER TABLE public.draft_picks
  ADD COLUMN IF NOT EXISTS was_keeper boolean NOT NULL DEFAULT false;

-- 2. room_keepers table
CREATE TABLE IF NOT EXISTS public.room_keepers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  team_idx smallint NOT NULL,
  player_id text NOT NULL,
  player_name text NOT NULL,
  player_position text,
  player_team text,
  keeper_round smallint, -- NULL = no cost (just remove from pool)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, player_id)
);
CREATE INDEX IF NOT EXISTS room_keepers_room_idx ON public.room_keepers(room_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_keepers TO authenticated;
GRANT ALL ON public.room_keepers TO service_role;

ALTER TABLE public.room_keepers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed users can view keepers"
  ON public.room_keepers FOR SELECT TO authenticated USING (true);
-- writes go through SECURITY DEFINER RPCs only; no direct write policy

-- 3. draft_pick_assignments table
CREATE TABLE IF NOT EXISTS public.draft_pick_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  pick_number integer NOT NULL,
  team_idx smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, pick_number)
);
CREATE INDEX IF NOT EXISTS draft_pick_assignments_room_idx ON public.draft_pick_assignments(room_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.draft_pick_assignments TO authenticated;
GRANT ALL ON public.draft_pick_assignments TO service_role;

ALTER TABLE public.draft_pick_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authed users can view pick assignments"
  ON public.draft_pick_assignments FOR SELECT TO authenticated USING (true);
-- writes through SECURITY DEFINER RPCs only

-- 4. Helper: default snake team for a (round, pick_in_round)
CREATE OR REPLACE FUNCTION public.snake_default_team(
  _room public.draft_rooms,
  _round smallint,
  _pick_in_round int
) RETURNS smallint
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _reverse boolean := false;
  _r smallint;
BEGIN
  FOR _r IN 1.._round - 1 LOOP
    IF NOT (_r = ANY(_room.reversal_rounds)) THEN
      _reverse := NOT _reverse;
    END IF;
  END LOOP;
  IF _reverse THEN
    RETURN (_room.team_count - _pick_in_round + 1)::smallint;
  ELSE
    RETURN _pick_in_round::smallint;
  END IF;
END;
$$;

-- 5. Helper: which team owns this pick_number? (assignments override snake)
CREATE OR REPLACE FUNCTION public.pick_team_for(
  _room public.draft_rooms,
  _pick_number int
) RETURNS smallint
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  _override smallint;
  _round smallint;
  _pick_in_round int;
BEGIN
  SELECT team_idx INTO _override
  FROM public.draft_pick_assignments
  WHERE room_id = _room.id AND pick_number = _pick_number;
  IF _override IS NOT NULL THEN RETURN _override; END IF;

  _round := ((_pick_number - 1) / _room.team_count) + 1;
  _pick_in_round := ((_pick_number - 1) % _room.team_count) + 1;
  RETURN public.snake_default_team(_room, _round, _pick_in_round);
END;
$$;

-- 6. Helper: pick_number for (team, round) — used to insert keepers
CREATE OR REPLACE FUNCTION public.team_pick_number(
  _room public.draft_rooms,
  _team_idx smallint,
  _round smallint
) RETURNS int
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  _pick_in_round int;
  _candidate int;
  _override_team smallint;
  _total_picks int;
BEGIN
  -- Determine default pick_in_round for this team in this round
  -- (inverse of snake_default_team)
  DECLARE
    _reverse boolean := false;
    _r smallint;
  BEGIN
    FOR _r IN 1.._round - 1 LOOP
      IF NOT (_r = ANY(_room.reversal_rounds)) THEN
        _reverse := NOT _reverse;
      END IF;
    END LOOP;
    IF _reverse THEN
      _pick_in_round := _room.team_count - _team_idx + 1;
    ELSE
      _pick_in_round := _team_idx;
    END IF;
  END;
  _candidate := (_round - 1) * _room.team_count + _pick_in_round;

  -- If that slot has been reassigned, walk all picks in the round to find
  -- the actual slot owned by _team_idx (accounts for trades).
  SELECT team_idx INTO _override_team
  FROM public.draft_pick_assignments
  WHERE room_id = _room.id AND pick_number = _candidate;

  IF _override_team IS NULL OR _override_team = _team_idx THEN
    RETURN _candidate;
  END IF;

  -- Trade in this round: scan round picks to find one owned by _team_idx
  DECLARE
    _scan int;
    _owner smallint;
  BEGIN
    FOR _scan IN ((_round - 1) * _room.team_count + 1)..(_round * _room.team_count) LOOP
      _owner := public.pick_team_for(_room, _scan);
      IF _owner = _team_idx THEN RETURN _scan; END IF;
    END LOOP;
  END;

  RETURN NULL;
END;
$$;

-- 7. Commissioner RPCs
CREATE OR REPLACE FUNCTION public.keeper_upsert(
  _room_id uuid,
  _team_idx smallint,
  _player_id text,
  _player_name text,
  _player_position text,
  _player_team text,
  _keeper_round smallint
) RETURNS public.room_keepers
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _row public.room_keepers;
  _team_keeper_count int;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the commissioner can manage keepers'; END IF;
  IF _room.status <> 'waiting' THEN RAISE EXCEPTION 'Keepers can only be set before the draft starts'; END IF;
  IF _room.draft_format NOT IN ('snake') THEN
    RAISE EXCEPTION 'Keepers are only supported in snake drafts for now';
  END IF;
  IF _team_idx < 1 OR _team_idx > _room.team_count THEN
    RAISE EXCEPTION 'Invalid team index';
  END IF;
  IF _keeper_round IS NOT NULL AND (_keeper_round < 1 OR _keeper_round > _room.rounds) THEN
    RAISE EXCEPTION 'Keeper round must be between 1 and %', _room.rounds;
  END IF;

  -- Enforce max keepers per team = rounds - 1 (leave at least 1 pick to make)
  SELECT count(*) INTO _team_keeper_count
  FROM public.room_keepers
  WHERE room_id = _room_id AND team_idx = _team_idx AND player_id <> _player_id;
  IF _team_keeper_count >= _room.rounds THEN
    RAISE EXCEPTION 'Team already has the maximum number of keepers (%)', _room.rounds;
  END IF;

  INSERT INTO public.room_keepers(
    room_id, team_idx, player_id, player_name, player_position, player_team, keeper_round
  ) VALUES (
    _room_id, _team_idx, _player_id, _player_name, _player_position, _player_team, _keeper_round
  )
  ON CONFLICT (room_id, player_id) DO UPDATE
    SET team_idx = EXCLUDED.team_idx,
        player_name = EXCLUDED.player_name,
        player_position = EXCLUDED.player_position,
        player_team = EXCLUDED.player_team,
        keeper_round = EXCLUDED.keeper_round,
        updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.keeper_remove(_room_id uuid, _player_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _room public.draft_rooms;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the commissioner can manage keepers'; END IF;
  IF _room.status <> 'waiting' THEN RAISE EXCEPTION 'Keepers are locked once the draft starts'; END IF;
  DELETE FROM public.room_keepers WHERE room_id = _room_id AND player_id = _player_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pick_assignment_set(
  _room_id uuid,
  _pick_number int,
  _team_idx smallint
) RETURNS public.draft_pick_assignments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _row public.draft_pick_assignments;
  _total_picks int;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the commissioner can reassign picks'; END IF;
  IF _room.status <> 'waiting' THEN RAISE EXCEPTION 'Picks are locked once the draft starts'; END IF;
  IF _room.draft_format NOT IN ('snake') THEN
    RAISE EXCEPTION 'Custom picks are only supported in snake drafts for now';
  END IF;
  _total_picks := _room.team_count * _room.rounds;
  IF _pick_number < 1 OR _pick_number > _total_picks THEN
    RAISE EXCEPTION 'Invalid pick number (1..%)', _total_picks;
  END IF;
  IF _team_idx < 1 OR _team_idx > _room.team_count THEN
    RAISE EXCEPTION 'Invalid team index';
  END IF;

  INSERT INTO public.draft_pick_assignments(room_id, pick_number, team_idx)
  VALUES (_room_id, _pick_number, _team_idx)
  ON CONFLICT (room_id, pick_number) DO UPDATE
    SET team_idx = EXCLUDED.team_idx, updated_at = now()
  RETURNING * INTO _row;
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.pick_assignment_reset(_room_id uuid, _pick_number int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _room public.draft_rooms;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the commissioner can reassign picks'; END IF;
  IF _room.status <> 'waiting' THEN RAISE EXCEPTION 'Picks are locked once the draft starts'; END IF;
  DELETE FROM public.draft_pick_assignments WHERE room_id = _room_id AND pick_number = _pick_number;
END;
$$;

-- 8. Update make_pick to use pick_team_for
CREATE OR REPLACE FUNCTION public.make_pick(
  _room_id uuid, _player_id text, _player_name text,
  _player_position text, _player_team text, _autopick boolean DEFAULT false
)
RETURNS public.draft_picks
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _round smallint;
  _team_idx smallint;
  _expected_user_id uuid;
  _total_picks int;
  _new_pick public.draft_picks;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.status <> 'drafting' THEN RAISE EXCEPTION 'Draft is not active'; END IF;

  _total_picks := _room.team_count * _room.rounds;
  IF _room.current_pick_number > _total_picks THEN RAISE EXCEPTION 'Draft already complete'; END IF;

  _round := ((_room.current_pick_number - 1) / _room.team_count) + 1;
  _team_idx := public.pick_team_for(_room, _room.current_pick_number);

  -- Block kept players
  IF EXISTS (SELECT 1 FROM public.room_keepers WHERE room_id = _room_id AND player_id = _player_id) THEN
    RAISE EXCEPTION 'Player is a keeper and cannot be drafted';
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
    _player_id, _player_name, _player_position, _player_team, _autopick
  )
  RETURNING * INTO _new_pick;

  -- Advance past any pre-existing keeper picks
  PERFORM public.advance_past_keepers(_room_id);

  RETURN _new_pick;
END;
$$;

-- 9. Helper: advance current_pick_number past any picks that already exist
-- (handles keeper picks pre-inserted at draft start, and back-to-back keepers)
CREATE OR REPLACE FUNCTION public.advance_past_keepers(_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _total_picks int;
  _exists boolean;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  _total_picks := _room.team_count * _room.rounds;

  LOOP
    -- Increment
    UPDATE public.draft_rooms
    SET current_pick_number = current_pick_number + 1,
        pick_deadline = CASE
          WHEN current_pick_number + 1 > _total_picks THEN NULL
          ELSE now() + (pick_clock_sec || ' seconds')::interval
        END
    WHERE id = _room_id
    RETURNING * INTO _room;

    IF _room.current_pick_number > _total_picks THEN
      UPDATE public.draft_rooms
      SET status = 'complete', pick_deadline = NULL, completed_at = now()
      WHERE id = _room_id;
      EXIT;
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.draft_picks
      WHERE room_id = _room_id AND pick_number = _room.current_pick_number
    ) INTO _exists;

    EXIT WHEN NOT _exists;
  END LOOP;
END;
$$;

-- 10. Pre-insert keepers helper, used at draft start
CREATE OR REPLACE FUNCTION public.insert_room_keepers(_room_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _k record;
  _pick_no int;
  _user_id uuid;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id;
  IF _room IS NULL THEN RETURN; END IF;

  FOR _k IN
    SELECT * FROM public.room_keepers
    WHERE room_id = _room_id AND keeper_round IS NOT NULL
    ORDER BY keeper_round, team_idx
  LOOP
    _pick_no := public.team_pick_number(_room, _k.team_idx, _k.keeper_round);
    IF _pick_no IS NULL THEN CONTINUE; END IF;
    -- Skip if a pick already exists at that slot (shouldn't happen pre-draft, but safe)
    IF EXISTS(SELECT 1 FROM public.draft_picks WHERE room_id = _room_id AND pick_number = _pick_no) THEN
      CONTINUE;
    END IF;

    SELECT user_id INTO _user_id
    FROM public.draft_participants
    WHERE room_id = _room_id AND draft_position = _k.team_idx;

    INSERT INTO public.draft_picks(
      room_id, pick_number, round, team_idx, user_id,
      player_id, player_name, player_position, player_team,
      was_autopick, was_keeper
    ) VALUES (
      _room_id, _pick_no, _k.keeper_round, _k.team_idx, _user_id,
      _k.player_id, _k.player_name, _k.player_position, _k.player_team,
      false, true
    );
  END LOOP;
END;
$$;

-- 11. Update auto_fill_and_start to call insert_room_keepers and advance
CREATE OR REPLACE FUNCTION public.auto_fill_and_start(_room_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _participant_count int;
  _bot_count int;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.status <> 'waiting' THEN RETURN; END IF;

  SELECT count(*) INTO _participant_count FROM public.draft_participants WHERE room_id = _room_id;
  IF _participant_count = 0 THEN RETURN; END IF;

  SELECT count(*) INTO _bot_count FROM public.draft_participants WHERE room_id = _room_id AND is_bot = true;

  WHILE _participant_count < _room.team_count LOOP
    _bot_count := _bot_count + 1;
    INSERT INTO public.draft_participants(room_id, user_id, team_name, is_bot)
    VALUES (_room_id, gen_random_uuid(), 'Bot ' || _bot_count, true);
    _participant_count := _participant_count + 1;
  END LOOP;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS pos
    FROM public.draft_participants WHERE room_id = _room_id
  )
  UPDATE public.draft_participants p
  SET draft_position = o.pos
  FROM ordered o WHERE p.id = o.id;

  IF _room.draft_format IN ('auction','auction_slow') THEN
    UPDATE public.draft_rooms
    SET status = 'drafting', current_pick_number = 1, pick_deadline = NULL,
        started_at = now(), auto_start_at = NULL
    WHERE id = _room_id;
  ELSE
    UPDATE public.draft_rooms
    SET status = 'drafting', current_pick_number = 1,
        pick_deadline = now() + (_room.pick_clock_sec || ' seconds')::interval,
        started_at = now(), auto_start_at = NULL
    WHERE id = _room_id;

    -- Insert keepers and advance past pre-filled slots
    PERFORM public.insert_room_keepers(_room_id);
    -- If pick #1 was a keeper, step forward
    IF EXISTS(SELECT 1 FROM public.draft_picks WHERE room_id = _room_id AND pick_number = 1) THEN
      -- rewind so advance_past_keepers starts the loop at #1 correctly
      UPDATE public.draft_rooms SET current_pick_number = 0 WHERE id = _room_id;
      PERFORM public.advance_past_keepers(_room_id);
    END IF;
  END IF;
END;
$$;

-- 12. Update start_draft similarly (snake only path)
CREATE OR REPLACE FUNCTION public.start_draft(_room_id uuid)
RETURNS public.draft_rooms
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _participant_count int;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can start the draft'; END IF;
  IF _room.status <> 'waiting' THEN RAISE EXCEPTION 'Draft already started'; END IF;

  SELECT count(*) INTO _participant_count FROM public.draft_participants WHERE room_id = _room_id;
  IF _participant_count = 0 THEN RAISE EXCEPTION 'Need at least one participant to start'; END IF;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS pos
    FROM public.draft_participants WHERE room_id = _room_id
  )
  UPDATE public.draft_participants p
  SET draft_position = o.pos
  FROM ordered o WHERE p.id = o.id;

  UPDATE public.draft_rooms
  SET status = 'drafting', current_pick_number = 1,
      pick_deadline = now() + (_room.pick_clock_sec || ' seconds')::interval,
      started_at = now()
  WHERE id = _room_id
  RETURNING * INTO _room;

  PERFORM public.insert_room_keepers(_room_id);
  IF EXISTS(SELECT 1 FROM public.draft_picks WHERE room_id = _room_id AND pick_number = 1) THEN
    UPDATE public.draft_rooms SET current_pick_number = 0 WHERE id = _room_id;
    PERFORM public.advance_past_keepers(_room_id);
    SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id;
  END IF;

  RETURN _room;
END;
$$;

-- 13. Update snake_autopick_due: respect pick_team_for + exclude keepers
CREATE OR REPLACE FUNCTION public.snake_autopick_due()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _round SMALLINT;
  _team_idx SMALLINT;
  _expected_user UUID;
  _is_bot BOOLEAN;
  _total_picks INT;
  _player_id TEXT;
  _player_name TEXT;
  _player_position TEXT;
  _player_team TEXT;
  _picked INT := 0;
  _is_empty_seat BOOLEAN;
  _fast_pick BOOLEAN;
  _have_pg INT; _have_sg INT; _have_sf INT; _have_pf INT; _have_c INT;
  _need_pg BOOLEAN; _need_sg BOOLEAN; _need_sf BOOLEAN; _need_pf BOOLEAN; _need_c BOOLEAN;
  _needed_positions TEXT[];
BEGIN
  FOR _room IN
    SELECT * FROM public.draft_rooms
    WHERE status = 'drafting' AND draft_format = 'snake'
    FOR UPDATE
  LOOP
    _total_picks := _room.team_count * _room.rounds;
    IF _room.current_pick_number > _total_picks THEN CONTINUE; END IF;

    _round := ((_room.current_pick_number - 1) / _room.team_count) + 1;
    _team_idx := public.pick_team_for(_room, _room.current_pick_number);

    SELECT user_id, COALESCE(is_bot, false) INTO _expected_user, _is_bot
    FROM public.draft_participants
    WHERE room_id = _room.id AND draft_position = _team_idx;

    _is_empty_seat := (_expected_user IS NULL);
    _fast_pick := _is_empty_seat OR COALESCE(_is_bot, false);

    IF NOT _fast_pick THEN
      IF _room.pick_deadline IS NULL OR now() < _room.pick_deadline THEN CONTINUE; END IF;
    END IF;

    _player_id := NULL;

    -- Try queue first (humans only)
    IF _expected_user IS NOT NULL AND NOT COALESCE(_is_bot, false) THEN
      SELECT q.player_id, q.player_name, q.player_position, q.player_team
        INTO _player_id, _player_name, _player_position, _player_team
      FROM public.draft_queues q
      WHERE q.room_id = _room.id
        AND q.user_id = _expected_user
        AND NOT EXISTS (
          SELECT 1 FROM public.draft_picks dp
          WHERE dp.room_id = _room.id AND dp.player_id = q.player_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.room_keepers rk
          WHERE rk.room_id = _room.id AND rk.player_id = q.player_id
        )
      ORDER BY q.rank ASC LIMIT 1;
    END IF;

    -- Need-based fallback
    IF _player_id IS NULL THEN
      SELECT
        COUNT(*) FILTER (WHERE position ILIKE '%PG%' OR position = 'G'),
        COUNT(*) FILTER (WHERE position ILIKE '%SG%' OR position = 'G'),
        COUNT(*) FILTER (WHERE position ILIKE '%SF%' OR position = 'F'),
        COUNT(*) FILTER (WHERE position ILIKE '%PF%' OR position = 'F'),
        COUNT(*) FILTER (WHERE position ILIKE '%C%')
      INTO _have_pg, _have_sg, _have_sf, _have_pf, _have_c
      FROM (
        SELECT UPPER(COALESCE(player_position, '')) AS position
        FROM public.draft_picks
        WHERE room_id = _room.id AND team_idx = _team_idx
      ) t;

      _need_pg := _have_pg < COALESCE(_room.slots_pg, 0);
      _need_sg := _have_sg < COALESCE(_room.slots_sg, 0);
      _need_sf := _have_sf < COALESCE(_room.slots_sf, 0);
      _need_pf := _have_pf < COALESCE(_room.slots_pf, 0);
      _need_c  := _have_c  < COALESCE(_room.slots_c,  0);

      _needed_positions := ARRAY[]::TEXT[];
      IF _need_pg THEN _needed_positions := _needed_positions || 'PG'; END IF;
      IF _need_sg THEN _needed_positions := _needed_positions || 'SG'; END IF;
      IF _need_sf THEN _needed_positions := _needed_positions || 'SF'; END IF;
      IF _need_pf THEN _needed_positions := _needed_positions || 'PF'; END IF;
      IF _need_c  THEN _needed_positions := _needed_positions || 'C';  END IF;

      IF array_length(_needed_positions, 1) IS NOT NULL THEN
        SELECT
          COALESCE(p.loose_key, p.player_key), p.full_name, p.position, p.team_abbreviation
          INTO _player_id, _player_name, _player_position, _player_team
        FROM public.players p
        LEFT JOIN public.player_season_stats s
          ON s.loose_key = p.loose_key AND s.season = 2025
        WHERE p.is_active = true
          AND NOT EXISTS (SELECT 1 FROM public.draft_picks dp
            WHERE dp.room_id = _room.id AND dp.player_id = COALESCE(p.loose_key, p.player_key))
          AND NOT EXISTS (SELECT 1 FROM public.room_keepers rk
            WHERE rk.room_id = _room.id AND rk.player_id = COALESCE(p.loose_key, p.player_key))
          AND EXISTS (
            SELECT 1 FROM unnest(_needed_positions) np
            WHERE UPPER(COALESCE(p.position, '')) LIKE '%' || np || '%'
               OR (np IN ('PG','SG') AND UPPER(COALESCE(p.position, '')) = 'G')
               OR (np IN ('SF','PF') AND UPPER(COALESCE(p.position, '')) = 'F')
          )
        ORDER BY COALESCE(s.minutes_per_game, 0) DESC NULLS LAST,
                 COALESCE(s.pts, 0) DESC NULLS LAST
        LIMIT 1;
      END IF;
    END IF;

    IF _player_id IS NULL THEN
      SELECT
        COALESCE(p.loose_key, p.player_key), p.full_name, p.position, p.team_abbreviation
        INTO _player_id, _player_name, _player_position, _player_team
      FROM public.players p
      LEFT JOIN public.player_season_stats s
        ON s.loose_key = p.loose_key AND s.season = 2025
      WHERE p.is_active = true
        AND NOT EXISTS (SELECT 1 FROM public.draft_picks dp
          WHERE dp.room_id = _room.id AND dp.player_id = COALESCE(p.loose_key, p.player_key))
        AND NOT EXISTS (SELECT 1 FROM public.room_keepers rk
          WHERE rk.room_id = _room.id AND rk.player_id = COALESCE(p.loose_key, p.player_key))
      ORDER BY COALESCE(s.minutes_per_game, 0) DESC NULLS LAST,
               COALESCE(s.pts, 0) DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF _player_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.draft_picks (
      room_id, pick_number, round, team_idx, user_id,
      player_id, player_name, player_position, player_team, was_autopick
    ) VALUES (
      _room.id, _room.current_pick_number, _round, _team_idx, _expected_user,
      _player_id, _player_name, _player_position, _player_team, true
    );

    IF _room.current_pick_number >= _total_picks THEN
      UPDATE public.draft_rooms
      SET status = 'complete', current_pick_number = _room.current_pick_number + 1,
          pick_deadline = NULL, completed_at = now()
      WHERE id = _room.id;
    ELSE
      UPDATE public.draft_rooms
      SET current_pick_number = _room.current_pick_number + 1,
          pick_deadline = CASE WHEN _fast_pick THEN now()
                               ELSE now() + (_room.pick_clock_sec || ' seconds')::interval END
      WHERE id = _room.id;
      PERFORM public.advance_past_keepers(_room.id);
    END IF;

    _picked := _picked + 1;
  END LOOP;

  RETURN _picked;
END;
$$;

-- 14. updated_at trigger for new tables
CREATE TRIGGER room_keepers_set_updated_at
BEFORE UPDATE ON public.room_keepers
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER draft_pick_assignments_set_updated_at
BEFORE UPDATE ON public.draft_pick_assignments
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
