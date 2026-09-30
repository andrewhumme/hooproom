-- HoopRank = one current ranking for every player.
--   1. admin Big Board overrides (global_player_ranks), when set;
--   2. Sleeper's current player ranking (search_rank), imported daily;
--   3. the stats-based z-score formula for anyone Sleeper doesn't rank.
--
-- The import runs entirely in the database (pg_net + pg_cron), so the ~2.5 MB
-- download never touches the Cloudflare Worker's CPU budget. Sleeper's terms
-- ask for the full player list at most once a day, cached on our side.
-- Sleeper's API is free for non-commercial use; license it (or swap the
-- source) before HoopRoom is monetized.

CREATE TABLE IF NOT EXISTS public.external_player_ranks (
  loose_key text PRIMARY KEY,
  source text NOT NULL,
  source_rank integer NOT NULL,
  full_name text NOT NULL,
  team text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS external_player_ranks_rank_idx
  ON public.external_player_ranks (source_rank);

ALTER TABLE public.external_player_ranks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Rankings are public" ON public.external_player_ranks;
CREATE POLICY "Rankings are public" ON public.external_player_ranks FOR SELECT USING (true);
GRANT SELECT ON public.external_player_ranks TO anon, authenticated;
GRANT ALL ON public.external_player_ranks TO service_role;

-- One row per import attempt, for the Admin Tools status panel.
CREATE TABLE IF NOT EXISTS public.external_rank_imports (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  request_id bigint,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  ranked integer,
  matched integer,
  error text
);
ALTER TABLE public.external_rank_imports ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.external_rank_imports TO service_role;

-- Step 1: ask pg_net to download Sleeper's player list (asynchronous).
CREATE OR REPLACE FUNCTION public.request_sleeper_ranks()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _request bigint;
  _id bigint;
BEGIN
  _request := net.http_get(
    url := 'https://api.sleeper.app/v1/players/nba',
    timeout_milliseconds := 60000
  );
  INSERT INTO public.external_rank_imports (source, request_id)
  VALUES ('sleeper', _request)
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$;

-- Step 2: import the most recent downloaded list. Returns a status summary;
-- 'pending' means the download hasn't finished yet (safe to call again).
CREATE OR REPLACE FUNCTION public.import_sleeper_ranks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _imp public.external_rank_imports;
  _resp record;
  _ranked integer;
  _matched integer;
BEGIN
  SELECT * INTO _imp FROM public.external_rank_imports
  WHERE source = 'sleeper' AND processed_at IS NULL
  ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'nothing_requested'); END IF;

  SELECT status_code, content, timed_out, error_msg INTO _resp
  FROM net._http_response WHERE id = _imp.request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pending'); END IF;

  IF _resp.timed_out OR _resp.status_code IS DISTINCT FROM 200 OR _resp.content IS NULL THEN
    UPDATE public.external_rank_imports
    SET processed_at = now(),
        error = COALESCE(_resp.error_msg, 'HTTP ' || COALESCE(_resp.status_code::text, 'timeout'))
    WHERE id = _imp.id;
    RETURN jsonb_build_object('status', 'error', 'error', COALESCE(_resp.error_msg, 'HTTP ' || COALESCE(_resp.status_code::text, 'timeout')));
  END IF;

  CREATE TEMP TABLE _sleeper ON COMMIT DROP AS
  SELECT DISTINCT ON (v->>'search_full_name')
         v->>'search_full_name' AS loose_key,
         (v->>'search_rank')::integer AS source_rank,
         COALESCE(v->>'full_name', trim(concat_ws(' ', v->>'first_name', v->>'last_name'))) AS full_name,
         v->>'team' AS team
  FROM jsonb_each(_resp.content::jsonb) AS e(k, v)
  WHERE (v->>'active')::boolean IS TRUE
    AND v->>'search_rank' IS NOT NULL
    AND COALESCE(v->>'search_full_name', '') <> ''
  ORDER BY v->>'search_full_name', (v->>'search_rank')::integer;

  SELECT count(*) INTO _ranked FROM _sleeper;
  -- Never replace a good ranking with an empty or broken download.
  IF _ranked < 100 THEN
    UPDATE public.external_rank_imports
    SET processed_at = now(), ranked = _ranked, error = 'Too few ranked players in download'
    WHERE id = _imp.id;
    RETURN jsonb_build_object('status', 'error', 'error', 'Too few ranked players', 'ranked', _ranked);
  END IF;

  DELETE FROM public.external_player_ranks WHERE source = 'sleeper';
  INSERT INTO public.external_player_ranks (loose_key, source, source_rank, full_name, team, updated_at)
  SELECT loose_key, 'sleeper', source_rank, full_name, team, now() FROM _sleeper
  ON CONFLICT (loose_key) DO UPDATE
    SET source = EXCLUDED.source, source_rank = EXCLUDED.source_rank,
        full_name = EXCLUDED.full_name, team = EXCLUDED.team, updated_at = now();

  SELECT count(*) INTO _matched
  FROM _sleeper s JOIN public.players p ON p.loose_key = s.loose_key AND p.is_active;

  UPDATE public.external_rank_imports
  SET processed_at = now(), ranked = _ranked, matched = _matched, error = NULL
  WHERE id = _imp.id;

  RETURN jsonb_build_object('status', 'ok', 'ranked', _ranked, 'matched', _matched);
END;
$function$;

REVOKE ALL ON FUNCTION public.request_sleeper_ranks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_sleeper_ranks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_sleeper_ranks() TO service_role;
GRANT EXECUTE ON FUNCTION public.import_sleeper_ranks() TO service_role;

-- Daily: download at 09:00 UTC, import at 09:05 (and again at 09:15 in case
-- the download was slow — importing only acts on an unprocessed request).
DO $$
BEGIN
  PERFORM cron.unschedule('hooprank-sleeper-request');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('hooprank-sleeper-import');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('hooprank-sleeper-request', '0 9 * * *',
  $cron$ SELECT public.request_sleeper_ranks(); $cron$);
SELECT cron.schedule('hooprank-sleeper-import', '5,15 9 * * *',
  $cron$ SELECT public.import_sleeper_ranks(); $cron$);

-- Bots and autopicks follow HoopRank.
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
          LEFT JOIN public.global_player_ranks gb
            ON regexp_replace(lower(gb.player_id), '[^a-z0-9]', '', 'g')
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
          -- HoopRank: admin Big Board overrides first, then the imported
          -- current ranking (Sleeper), then the stats formula — with NBA
          -- draft slot standing in for stats in rookie-only pools.
          ORDER BY gb.rank ASC NULLS LAST,
                   xr.source_rank ASC NULLS LAST,
                   (CASE WHEN _rookies_only THEN COALESCE(p.draft_number, 9999) ELSE 0 END) ASC,
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

REVOKE ALL ON FUNCTION public.snake_autopick_room(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snake_autopick_room(uuid) TO service_role;
