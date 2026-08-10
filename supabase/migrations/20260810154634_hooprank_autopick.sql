-- HoopRank z-scores in SQL, mirroring src/lib/auctionValues.ts computeZTotals.
CREATE OR REPLACE FUNCTION public.hoop_z_scores(_format text DEFAULT '9-CAT')
RETURNS TABLE(loose_key text, z numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH q AS (
  SELECT s.loose_key AS lk,
         COALESCE(s.pts,0)::numeric AS pts,
         COALESCE(s.reb,0)::numeric AS reb,
         COALESCE(s.ast,0)::numeric AS ast,
         COALESCE(s.stl,0)::numeric AS stl,
         COALESCE(s.blk,0)::numeric AS blk,
         COALESCE(s.tov,0)::numeric AS tov,
         COALESCE(s.fg3_made,0)::numeric AS fg3m,
         COALESCE(s.fg_pct,0)::numeric AS fg_pct,
         COALESCE(s.fg_att,0)::numeric AS fg_att,
         COALESCE(s.ft_pct,0)::numeric AS ft_pct,
         COALESCE(s.ft_att,0)::numeric AS ft_att
  FROM public.player_season_stats s
  WHERE s.season = 2025
    AND s.loose_key IS NOT NULL
    AND (COALESCE(s.games_played,0) >= 20 OR COALESCE(s.minutes_per_game,0) >= 12)
),
a AS (SELECT AVG(fg_pct) AS afg, AVG(ft_pct) AS aft FROM q),
i AS (
  SELECT q.*, (q.fg_pct - a.afg) * q.fg_att AS fgi, (q.ft_pct - a.aft) * q.ft_att AS fti
  FROM q CROSS JOIN a
),
m AS (
  SELECT AVG(pts) mpts, NULLIF(stddev_pop(pts),0) spts,
         AVG(reb) mreb, NULLIF(stddev_pop(reb),0) sreb,
         AVG(ast) mast, NULLIF(stddev_pop(ast),0) sast,
         AVG(stl) mstl, NULLIF(stddev_pop(stl),0) sstl,
         AVG(blk) mblk, NULLIF(stddev_pop(blk),0) sblk,
         AVG(tov) mtov, NULLIF(stddev_pop(tov),0) stov,
         AVG(fg3m) mfg3, NULLIF(stddev_pop(fg3m),0) sfg3,
         AVG(fgi) mfgi, NULLIF(stddev_pop(fgi),0) sfgi,
         AVG(fti) mfti, NULLIF(stddev_pop(fti),0) sfti
  FROM i
)
SELECT i.lk,
  CASE
    WHEN UPPER(COALESCE(_format,'')) LIKE 'PTS%' OR UPPER(COALESCE(_format,'')) = 'POINTS'
      THEN (i.pts - m.mpts) / COALESCE(m.spts,1)
    ELSE
      (i.pts - m.mpts) / COALESCE(m.spts,1)
      + (i.reb - m.mreb) / COALESCE(m.sreb,1)
      + (i.ast - m.mast) / COALESCE(m.sast,1)
      + (i.stl - m.mstl) / COALESCE(m.sstl,1)
      + (i.blk - m.mblk) / COALESCE(m.sblk,1)
      + (i.fg3m - m.mfg3) / COALESCE(m.sfg3,1)
      + (i.fgi - m.mfgi) / COALESCE(m.sfgi,1)
      + (i.fti - m.mfti) / COALESCE(m.sfti,1)
      + CASE WHEN UPPER(COALESCE(_format,'')) LIKE '%8%'
             THEN 0
             ELSE -((i.tov - m.mtov) / COALESCE(m.stov,1)) END
  END AS z
FROM i CROSS JOIN m;
$function$;

REVOKE ALL ON FUNCTION public.hoop_z_scores(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hoop_z_scores(text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.snake_autopick_due()
 RETURNS integer
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
  _picked INT := 0;
  _is_empty_seat BOOLEAN;
  _fast_pick BOOLEAN;
  _rookies_only BOOLEAN;
  _have_pg INT; _have_sg INT; _have_sf INT; _have_pf INT; _have_c INT;
  _need_pg BOOLEAN; _need_sg BOOLEAN; _need_sf BOOLEAN; _need_pf BOOLEAN; _need_c BOOLEAN;
  _needed_positions TEXT[];
BEGIN
  FOR _room IN
    SELECT * FROM public.draft_rooms
    WHERE status = 'drafting' AND draft_format = 'snake'
    FOR UPDATE
  LOOP
    BEGIN
      _total_picks := _room.team_count * _room.rounds;
      IF _room.current_pick_number > _total_picks THEN CONTINUE; END IF;

      _rookies_only := COALESCE(_room.player_pool, 'all') = 'rookies';

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
        IF _need_pg THEN _needed_positions := _needed_positions || ARRAY['PG']; END IF;
        IF _need_sg THEN _needed_positions := _needed_positions || ARRAY['SG']; END IF;
        IF _need_sf THEN _needed_positions := _needed_positions || ARRAY['SF']; END IF;
        IF _need_pf THEN _needed_positions := _needed_positions || ARRAY['PF']; END IF;
        IF _need_c  THEN _needed_positions := _needed_positions || ARRAY['C'];  END IF;

        IF array_length(_needed_positions, 1) IS NOT NULL THEN
          SELECT
            COALESCE(p.loose_key, p.player_key), p.full_name, p.position, p.team_abbreviation
            INTO _player_id, _player_name, _player_position, _player_team
          FROM public.players p
          LEFT JOIN public.player_season_stats s
            ON s.loose_key = p.loose_key AND s.season = 2025
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
            AND EXISTS (
              SELECT 1 FROM unnest(_needed_positions) np
              WHERE UPPER(COALESCE(p.position, '')) LIKE '%' || np || '%'
                 OR (np IN ('PG','SG') AND UPPER(COALESCE(p.position, '')) = 'G')
                 OR (np IN ('SF','PF') AND UPPER(COALESCE(p.position, '')) = 'F')
            )
          ORDER BY (CASE WHEN _rookies_only THEN COALESCE(p.draft_number, 9999) ELSE 0 END) ASC,
                   hz.z DESC NULLS LAST,
                   COALESCE(s.minutes_per_game, 0) DESC NULLS LAST,
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
        LIMIT 1;
      END IF;

      IF _player_id IS NULL THEN CONTINUE; END IF;

      PERFORM public.make_pick(_room.id, _player_id, _player_name,
                               _player_position, _player_team, true);
      _picked := _picked + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'snake_autopick_due: room % failed: %', _room.id, SQLERRM;
      CONTINUE;
    END;
  END LOOP;

  RETURN _picked;
END;
$function$

;
