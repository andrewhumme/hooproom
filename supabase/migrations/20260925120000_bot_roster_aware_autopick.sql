-- Bots (and expired human clocks with an empty queue) now take the best-ranked
-- available player, and only deviate from the ranking when drafting that
-- player would leave the team unable to fill its remaining roster slots.
--
-- Previously the autopick restricted candidates to any specific position
-- (PG/SG/SF/PF/C) the team hadn't filled yet, ignoring G/F/FLX/BN slots, so
-- bots reached for positional needs far earlier than necessary.

-- Bitmask of roster slot types a position string can fill. Mirrors
-- eligibleSlotsForPosition + assignPicksToSlots in src/lib/rosterSlots.ts.
--   PG=1 SG=2 SF=4 PF=8 C=16 G=32 F=64 FLX=128 BN=256
CREATE OR REPLACE FUNCTION public.hoop_slot_mask(_pos text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  p TEXT := upper(COALESCE(_pos, ''));
  m INTEGER := 0;
BEGIN
  IF p = '' THEN RETURN 128 | 256; END IF;
  IF p LIKE '%PG%' THEN m := m | 1; END IF;
  IF p LIKE '%SG%' THEN m := m | 2; END IF;
  IF p LIKE '%SF%' THEN m := m | 4; END IF;
  IF p LIKE '%PF%' THEN m := m | 8; END IF;
  IF p = 'G' OR p LIKE '%G-%' OR p LIKE '%-G' THEN m := m | 1 | 2; END IF;
  IF p = 'F' OR p LIKE '%F-%' OR p LIKE '%-F' THEN m := m | 4 | 8; END IF;
  IF p LIKE '%C%' THEN m := m | 16; END IF;
  IF m = 0 THEN RETURN 128 | 256; END IF;
  IF (m & 3) <> 0 THEN m := m | 32; END IF;
  IF (m & 12) <> 0 THEN m := m | 64; END IF;
  RETURN m | 128 | 256;
END;
$function$;

-- True when every player (given as slot masks) can be placed in a distinct
-- roster slot of the room. Uses Hall's condition over slot types: for every
-- set of slot types T, the players who can only play inside T must not
-- outnumber T's capacity. FLX and BN accept everyone, so only sets that
-- include both can be violated — 128 checks.
CREATE OR REPLACE FUNCTION public.hoop_roster_fits(_room public.draft_rooms, _masks integer[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  i INTEGER;
  t INTEGER;
  cap INTEGER;
  cnt INTEGER;
BEGIN
  FOR i IN 0..127 LOOP
    t := i | 128 | 256;
    cap := CASE WHEN (t & 1)  <> 0 THEN COALESCE(_room.slots_pg, 0)  ELSE 0 END
         + CASE WHEN (t & 2)  <> 0 THEN COALESCE(_room.slots_sg, 0)  ELSE 0 END
         + CASE WHEN (t & 4)  <> 0 THEN COALESCE(_room.slots_sf, 0)  ELSE 0 END
         + CASE WHEN (t & 8)  <> 0 THEN COALESCE(_room.slots_pf, 0)  ELSE 0 END
         + CASE WHEN (t & 16) <> 0 THEN COALESCE(_room.slots_c, 0)   ELSE 0 END
         + CASE WHEN (t & 32) <> 0 THEN COALESCE(_room.slots_g, 0)   ELSE 0 END
         + CASE WHEN (t & 64) <> 0 THEN COALESCE(_room.slots_f, 0)   ELSE 0 END
         + COALESCE(_room.slots_flx, 0)
         + COALESCE(_room.slots_bn, 0);
    SELECT COUNT(*) INTO cnt FROM unnest(_masks) m WHERE (m & ~t) = 0;
    IF cnt > cap THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.hoop_slot_mask(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hoop_roster_fits(public.draft_rooms, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hoop_slot_mask(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hoop_roster_fits(public.draft_rooms, integer[]) TO service_role;

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
  _team_masks INTEGER[];
  _cand RECORD;
  _first RECORD;
  _found BOOLEAN;
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
$function$;
