-- Rookie Big Board: an admin-curated ranking that applies only to rookie-only
-- drafts (player_pool = 'rookies'), where it takes the Global Big Board's
-- place. Rookies not on it fall back to HoopRank, then NBA draft slot.
CREATE TABLE IF NOT EXISTS public.rookie_player_ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id text NOT NULL UNIQUE,
  player_name text NOT NULL,
  player_position text,
  player_team text,
  rank smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rookie_player_ranks_rank_idx ON public.rookie_player_ranks (rank);

GRANT SELECT ON public.rookie_player_ranks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rookie_player_ranks TO authenticated;
GRANT ALL ON public.rookie_player_ranks TO service_role;

ALTER TABLE public.rookie_player_ranks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view the rookie board" ON public.rookie_player_ranks;
CREATE POLICY "Anyone can view the rookie board"
  ON public.rookie_player_ranks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can insert rookie board entries" ON public.rookie_player_ranks;
CREATE POLICY "Admins can insert rookie board entries"
  ON public.rookie_player_ranks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update rookie board entries" ON public.rookie_player_ranks;
CREATE POLICY "Admins can update rookie board entries"
  ON public.rookie_player_ranks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete rookie board entries" ON public.rookie_player_ranks;
CREATE POLICY "Admins can delete rookie board entries"
  ON public.rookie_player_ranks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS rookie_player_ranks_updated_at ON public.rookie_player_ranks;
CREATE TRIGGER rookie_player_ranks_updated_at
  BEFORE UPDATE ON public.rookie_player_ranks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Bots and autopicks: Rookie Big Board first in rookie-only drafts.
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
