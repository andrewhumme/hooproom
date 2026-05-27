
CREATE OR REPLACE FUNCTION public.snake_autopick_due()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _room public.draft_rooms;
  _round SMALLINT;
  _pick_in_round INT;
  _team_idx SMALLINT;
  _expected_user UUID;
  _is_bot BOOLEAN;
  _reverse BOOLEAN;
  _r SMALLINT;
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
    _pick_in_round := ((_room.current_pick_number - 1) % _room.team_count) + 1;
    _reverse := false;
    FOR _r IN 1.._round - 1 LOOP
      IF NOT (_r = ANY(_room.reversal_rounds)) THEN
        _reverse := NOT _reverse;
      END IF;
    END LOOP;
    IF _reverse THEN
      _team_idx := _room.team_count - _pick_in_round + 1;
    ELSE
      _team_idx := _pick_in_round;
    END IF;

    SELECT user_id, COALESCE(is_bot, false) INTO _expected_user, _is_bot
    FROM public.draft_participants
    WHERE room_id = _room.id AND draft_position = _team_idx;

    _is_empty_seat := (_expected_user IS NULL);
    _fast_pick := _is_empty_seat OR COALESCE(_is_bot, false);

    -- Gate: bot/empty seats pick immediately; human seats wait for deadline.
    IF NOT _fast_pick THEN
      IF _room.pick_deadline IS NULL OR now() < _room.pick_deadline THEN
        CONTINUE;
      END IF;
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
          WHERE dp.room_id = _room.id AND dp.player_id = q.player_id
        )
      ORDER BY q.rank ASC
      LIMIT 1;
    END IF;

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
          COALESCE(p.loose_key, p.player_key),
          p.full_name,
          p.position,
          p.team_abbreviation
          INTO _player_id, _player_name, _player_position, _player_team
        FROM public.players p
        LEFT JOIN public.player_season_stats s
          ON s.loose_key = p.loose_key AND s.season = 2025
        WHERE p.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM public.draft_picks dp
            WHERE dp.room_id = _room.id AND dp.player_id = COALESCE(p.loose_key, p.player_key)
          )
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
        COALESCE(p.loose_key, p.player_key),
        p.full_name,
        p.position,
        p.team_abbreviation
        INTO _player_id, _player_name, _player_position, _player_team
      FROM public.players p
      LEFT JOIN public.player_season_stats s
        ON s.loose_key = p.loose_key AND s.season = 2025
      WHERE p.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM public.draft_picks dp
          WHERE dp.room_id = _room.id AND dp.player_id = COALESCE(p.loose_key, p.player_key)
        )
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
      SET status = 'complete',
          current_pick_number = _room.current_pick_number + 1,
          pick_deadline = NULL,
          completed_at = now()
      WHERE id = _room.id;
    ELSE
      UPDATE public.draft_rooms
      SET current_pick_number = _room.current_pick_number + 1,
          pick_deadline = CASE
            WHEN _fast_pick THEN now()
            ELSE now() + (_room.pick_clock_sec || ' seconds')::interval
          END
      WHERE id = _room.id;
    END IF;

    _picked := _picked + 1;
  END LOOP;

  RETURN _picked;
END;
$function$;
