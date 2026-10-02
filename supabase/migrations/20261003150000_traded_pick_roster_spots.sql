-- Pick trades adjust a team's roster for that draft: each extra pick it owns
-- adds a FLX spot, each pick traded away removes one (then a bench spot). The
-- app applies this when showing rosters; bots and autopicks now use the same
-- adjusted roster when checking which players still fit.

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
  _fit_room public.draft_rooms;
  _team_total INTEGER;
  _delta INTEGER;
  _from_flx INTEGER;
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

        -- Pick trades: this team's roster has one FLX spot per extra pick it
        -- owns (or one fewer per pick traded away, then bench), matching the
        -- app's adjustSlotsForPicks.
        SELECT count(*) INTO _team_total
        FROM generate_series(1, _total_picks) AS g(n)
        WHERE public.pick_team_for(_room, g.n) = _team_idx;
        _fit_room := _room;
        _delta := _team_total - _room.rounds;
        IF _delta > 0 THEN
          _fit_room.slots_flx := COALESCE(_room.slots_flx, 0) + _delta;
        ELSIF _delta < 0 THEN
          _from_flx := LEAST(-_delta, COALESCE(_room.slots_flx, 0));
          _fit_room.slots_flx := COALESCE(_room.slots_flx, 0) - _from_flx;
          _fit_room.slots_bn := GREATEST(0, COALESCE(_room.slots_bn, 0) - (-_delta - _from_flx));
        END IF;

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
          LEFT JOIN public.global_player_ranks gb
            ON regexp_replace(lower(gb.player_id), '[^a-z0-9]', '', 'g')
             = regexp_replace(lower(COALESCE(p.loose_key, p.player_key)), '[^a-z0-9]', '', 'g')
          LEFT JOIN public.rookie_player_ranks rb
            ON regexp_replace(lower(rb.player_id), '[^a-z0-9]', '', 'g')
             = regexp_replace(lower(COALESCE(p.loose_key, p.player_key)), '[^a-z0-9]', '', 'g')
          LEFT JOIN public.external_player_ranks xr
            ON xr.loose_key = regexp_replace(lower(COALESCE(p.loose_key, p.player_key)), '[^a-z0-9]', '', 'g')
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
          -- Admin board first — the Rookie Big Board in rookie-only pools,
          -- the Global Big Board otherwise — then HoopRank: the imported
          -- current ranking (Sleeper), then the stats formula, with NBA draft
          -- slot standing in for stats in rookie-only pools.
          ORDER BY (CASE WHEN _rookies_only THEN rb.rank ELSE gb.rank END) ASC NULLS LAST,
                   xr.source_rank ASC NULLS LAST,
                   (CASE WHEN _rookies_only THEN COALESCE(p.draft_number, 9999) ELSE 0 END) ASC,
                   hz.z DESC NULLS LAST,
                   COALESCE(s.minutes_per_game, 0) DESC NULLS LAST,
                   COALESCE(s.pts, 0) DESC NULLS LAST
          LIMIT 300
        LOOP
          IF _first IS NULL THEN _first := _cand; END IF;
          IF public.hoop_roster_fits(_fit_room, _team_masks || public.hoop_slot_mask(_cand.position)) THEN
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

REVOKE ALL ON FUNCTION public.snake_autopick_room(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snake_autopick_room(uuid) TO service_role;
