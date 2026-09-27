-- Autopicks are now always chosen by the server.
--
-- Previously, when a pick clock expired, whichever browser noticed first
-- chose the player from *its own viewer's* list: their search/position
-- filter, their sort column, their personal Big Board, and a roster-fit check
-- against the viewer's team instead of the team on the clock. It also skipped
-- the on-clock manager's queue. Now:
--   * snake_autopick_room() makes one room's due autopick (queue first, then
--     best-ranked player that fits the on-clock team's roster);
--   * request_autopick() lets any client viewing the room trigger it the
--     moment a clock expires, without choosing the player;
--   * snake_autopick_due() (cron) loops rooms through the same function;
--   * make_pick() rejects client-chosen autopicks and no longer lets another
--     manager pick for a team whose clock has expired.

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
  -- Autopicks are chosen by the server (snake_autopick_room), never by a
  -- client. Signed-in callers may only autopick through that function, which
  -- flags the transaction; cron / service-role calls have no auth.uid().
  IF _autopick AND auth.uid() IS NOT NULL
     AND current_setting('hooproom.internal_autopick', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Autopicks are made by the server — call request_autopick';
  END IF;

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
    -- Only the manager on the clock picks. An expired clock is handled by
    -- request_autopick, so other clients can no longer choose the player.
    IF _expected_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Not your turn';
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


CREATE OR REPLACE FUNCTION public.snake_autopick_room(_room_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _is_empty_seat BOOLEAN;
  _fast_pick BOOLEAN;
  _rookies_only BOOLEAN;
  _team_masks INTEGER[];
  _cand RECORD;
  _first RECORD;
  _found BOOLEAN;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms
  WHERE id = _room_id AND status = 'drafting' AND draft_format = 'snake'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

    BEGIN
      _total_picks := _room.team_count * _room.rounds;
      IF _room.current_pick_number > _total_picks THEN RETURN false; END IF;

      _rookies_only := COALESCE(_room.player_pool, 'all') = 'rookies';

      _round := ((_room.current_pick_number - 1) / _room.team_count) + 1;
      _team_idx := public.pick_team_for(_room, _room.current_pick_number);

      SELECT user_id, COALESCE(is_bot, false) INTO _expected_user, _is_bot
      FROM public.draft_participants
      WHERE room_id = _room.id AND draft_position = _team_idx;

      _is_empty_seat := (_expected_user IS NULL);
      _fast_pick := _is_empty_seat OR COALESCE(_is_bot, false);

      IF NOT _fast_pick THEN
        IF _room.pick_deadline IS NULL OR now() < _room.pick_deadline THEN RETURN false; END IF;
      END IF;

      _player_id := NULL;

      IF _expected_user IS NOT NULL AND NOT COALESCE(_is_bot, false) THEN
        SELECT q.player_id, q.player_name, q.player_position, q.player_team
          INTO _player_id, _player_name, _player_position, _player_team
        FROM public.draft_queues q
        WHERE q.room_id = _room.id
          AND q.user_id = _expected_user
          AND NOT EXISTS (
            SELECT 1 FROM public.draft_picks dp
            WHERE dp.room_id = _room.id
              AND regexp_replace(lower(dp.player_id), '[^a-z0-9]', '', 'g')
                = regexp_replace(lower(q.player_id), '[^a-z0-9]', '', 'g')
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.room_keepers rk
            WHERE rk.room_id = _room.id
              AND regexp_replace(lower(rk.player_id), '[^a-z0-9]', '', 'g')
                = regexp_replace(lower(q.player_id), '[^a-z0-9]', '', 'g')
          )
        ORDER BY q.rank ASC LIMIT 1;
      END IF;

      IF _player_id IS NULL THEN
        -- Everyone already on this team: drafted players plus keepers that
        -- haven't been slotted into draft_picks yet.
        SELECT COALESCE(array_agg(public.hoop_slot_mask(pos)), ARRAY[]::INTEGER[])
          INTO _team_masks
        FROM (
          SELECT dp.player_position AS pos
          FROM public.draft_picks dp
          WHERE dp.room_id = _room.id AND dp.team_idx = _team_idx
          UNION ALL
          SELECT rk.player_position
          FROM public.room_keepers rk
          WHERE rk.room_id = _room.id AND rk.team_idx = _team_idx
            AND NOT EXISTS (
              SELECT 1 FROM public.draft_picks dp
              WHERE dp.room_id = _room.id
                AND regexp_replace(lower(dp.player_id), '[^a-z0-9]', '', 'g')
                  = regexp_replace(lower(rk.player_id), '[^a-z0-9]', '', 'g')
            )
        ) t;

        _first := NULL;
        _found := false;

        -- Walk the ranking best-first; take the first player the roster can
        -- still absorb without stranding an unfilled position.
        FOR _cand IN
          SELECT
            COALESCE(p.loose_key, p.player_key) AS pid,
            p.full_name, p.position, p.team_abbreviation
          FROM public.players p
          LEFT JOIN public.player_season_stats s
            ON s.loose_key = p.loose_key AND s.season = 2026
          LEFT JOIN public.hoop_z_scores(COALESCE(_room.scoring_format,'9-CAT')) hz
            ON hz.loose_key = p.loose_key
          WHERE p.is_active = true
            AND (NOT _rookies_only OR COALESCE(p.is_rookie, false))
            AND NOT EXISTS (
              SELECT 1 FROM public.draft_picks dp
              WHERE dp.room_id = _room.id
                AND regexp_replace(lower(dp.player_id), '[^a-z0-9]', '', 'g')
                  = regexp_replace(lower(COALESCE(p.loose_key, p.player_key)), '[^a-z0-9]', '', 'g')
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.room_keepers rk
              WHERE rk.room_id = _room.id
                AND regexp_replace(lower(rk.player_id), '[^a-z0-9]', '', 'g')
                  = regexp_replace(lower(COALESCE(p.loose_key, p.player_key)), '[^a-z0-9]', '', 'g')
            )
          ORDER BY (CASE WHEN _rookies_only THEN COALESCE(p.draft_number, 9999) ELSE 0 END) ASC,
                   hz.z DESC NULLS LAST,
                   COALESCE(s.minutes_per_game, 0) DESC NULLS LAST,
                   COALESCE(s.pts, 0) DESC NULLS LAST
          LIMIT 300
        LOOP
          IF _first IS NULL THEN _first := _cand; END IF;
          IF public.hoop_roster_fits(_room, _team_masks || public.hoop_slot_mask(_cand.position)) THEN
            _player_id := _cand.pid;
            _player_name := _cand.full_name;
            _player_position := _cand.position;
            _player_team := _cand.team_abbreviation;
            _found := true;
            EXIT;
          END IF;
        END LOOP;

        -- Nobody fits (misconfigured slots or exhausted pool): never stall
        -- the draft — fall back to best available.
        IF NOT _found AND _first IS NOT NULL THEN
          _player_id := _first.pid;
          _player_name := _first.full_name;
          _player_position := _first.position;
          _player_team := _first.team_abbreviation;
        END IF;
      END IF;

      IF _player_id IS NULL THEN RETURN false; END IF;

      PERFORM set_config('hooproom.internal_autopick', 'on', true);
      PERFORM public.make_pick(_room.id, _player_id, _player_name,
                               _player_position, _player_team, true);
      PERFORM set_config('hooproom.internal_autopick', 'off', true);
      RETURN true;
    END;
END;
$function$;


CREATE OR REPLACE FUNCTION public.snake_autopick_due()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rid uuid;
  _picked INT := 0;
BEGIN
  FOR _rid IN
    SELECT id FROM public.draft_rooms
    WHERE status = 'drafting' AND draft_format = 'snake'
  LOOP
    BEGIN
      IF public.snake_autopick_room(_rid) THEN _picked := _picked + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'snake_autopick_due: room % failed: %', _rid, SQLERRM;
    END;
  END LOOP;
  RETURN _picked;
END;
$function$;

-- Client trigger: make the room's autopick now if one is due. The server
-- decides whether it's due and which player; the caller only needs to be
-- able to see the room.
CREATE OR REPLACE FUNCTION public.request_autopick(_room_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_room(_room_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN public.snake_autopick_room(_room_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.snake_autopick_room(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snake_autopick_room(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.request_autopick(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_autopick(uuid) TO authenticated;
