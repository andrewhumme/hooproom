-- Auction prices from HoopRank, shared by the auction room and the bots.
--
-- Before: suggested prices came from the stats formula alone (rookies always
-- $1, ignoring Sleeper and the Big Boards), bots bid up to a rough
-- 0.7 x MPG + 0.5 x PTS from LAST season, and bots nominated by last season's
-- minutes. Now one per-room price table orders players by HoopRank (Rookie Big
-- Board in rookie auctions / Global Big Board otherwise, then Sleeper, then
-- stats) and gives each position dollars from the same surplus curve as before
-- (teams x budget money, teams x roster draftable slots, $1 floor). The room UI
-- reads it, bots bid up to it (±15% per bot) and nominate from its top.

CREATE TABLE IF NOT EXISTS public.auction_value_cache (
  room_id uuid NOT NULL,
  loose_key text NOT NULL,
  pos integer NOT NULL,
  dollars integer NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, loose_key)
);
CREATE INDEX IF NOT EXISTS auction_value_cache_pos_idx ON public.auction_value_cache (room_id, pos);
ALTER TABLE public.auction_value_cache ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.auction_value_cache TO service_role;

-- (Re)build a room's price table.
CREATE OR REPLACE FUNCTION public.compute_auction_values(_room_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _room public.draft_rooms;
  _rookies boolean;
  _n integer;          -- draftable slots across the league
  _pool numeric;       -- money above the $1-per-slot floor
  _count integer;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  _rookies := COALESCE(_room.player_pool, 'all') = 'rookies';
  _n := GREATEST(1, _room.team_count * public.auction_total_slots(_room));
  _pool := GREATEST(0, _room.team_count * COALESCE(_room.auction_budget, 200) - _n);

  DELETE FROM public.auction_value_cache WHERE room_id = _room_id;

  WITH z AS (
    SELECT loose_key, z FROM public.hoop_z_scores(COALESCE(_room.scoring_format, '9-CAT'))
  ),
  -- Dollar curve: the league-wide stats distribution, by position.
  zc AS (
    SELECT z, row_number() OVER (ORDER BY z DESC) AS pos FROM z
  ),
  zrep AS (
    SELECT COALESCE((SELECT z FROM zc WHERE pos = _n), (SELECT min(z) FROM zc), 0) AS z
  ),
  slots AS (
    SELECT g.pos, GREATEST(0, COALESCE(zc.z, (SELECT z FROM zrep)) - (SELECT z FROM zrep)) AS surplus
    FROM generate_series(1, _n) AS g(pos)
    LEFT JOIN zc ON zc.pos = g.pos
  ),
  curve AS (
    -- Fall back to a straight-line curve if there are no stats at all.
    SELECT pos,
           CASE WHEN (SELECT sum(surplus) FROM slots) > 0
                THEN surplus / (SELECT sum(surplus) FROM slots)
                ELSE (_n - pos + 1)::numeric / (_n * (_n + 1) / 2.0)
           END AS share
    FROM slots
  ),
  -- HoopRank order for this room's player pool.
  ranked AS (
    SELECT regexp_replace(lower(COALESCE(p.loose_key, p.player_key)), '[^a-z0-9]', '', 'g') AS lk,
           row_number() OVER (
             ORDER BY (CASE WHEN _rookies THEN rb.rank ELSE gb.rank END) ASC NULLS LAST,
                      xr.source_rank ASC NULLS LAST,
                      (CASE WHEN _rookies THEN p.draft_number END) ASC NULLS LAST,
                      z.z DESC NULLS LAST,
                      p.full_name
           ) AS pos
    FROM public.players p
    LEFT JOIN public.global_player_ranks gb
      ON regexp_replace(lower(gb.player_id), '[^a-z0-9]', '', 'g')
       = regexp_replace(lower(COALESCE(p.loose_key, p.player_key)), '[^a-z0-9]', '', 'g')
    LEFT JOIN public.rookie_player_ranks rb
      ON regexp_replace(lower(rb.player_id), '[^a-z0-9]', '', 'g')
       = regexp_replace(lower(COALESCE(p.loose_key, p.player_key)), '[^a-z0-9]', '', 'g')
    LEFT JOIN public.external_player_ranks xr
      ON xr.loose_key = regexp_replace(lower(COALESCE(p.loose_key, p.player_key)), '[^a-z0-9]', '', 'g')
    LEFT JOIN z ON z.loose_key = p.loose_key
    WHERE p.is_active AND (NOT _rookies OR COALESCE(p.is_rookie, false))
  )
  INSERT INTO public.auction_value_cache (room_id, loose_key, pos, dollars)
  SELECT DISTINCT ON (r.lk) _room_id, r.lk, r.pos,
         CASE WHEN c.share IS NULL THEN 1 ELSE GREATEST(1, round(1 + c.share * _pool))::integer END
  FROM ranked r
  LEFT JOIN curve c ON c.pos = r.pos
  ORDER BY r.lk, r.pos;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$function$;

-- Make sure a room has prices. Refreshed at most every 10 minutes while the
-- room is waiting; frozen once the auction is underway so prices don't move
-- mid-draft.
CREATE OR REPLACE FUNCTION public.ensure_auction_values(_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _computed timestamptz;
  _status text;
BEGIN
  SELECT max(computed_at) INTO _computed FROM public.auction_value_cache WHERE room_id = _room_id;
  SELECT status INTO _status FROM public.draft_rooms WHERE id = _room_id;
  IF _computed IS NULL
     OR (_status = 'waiting' AND _computed < now() - interval '10 minutes') THEN
    PERFORM public.compute_auction_values(_room_id);
  END IF;
END;
$function$;

-- Prices for the auction room UI (anyone who can see the room).
CREATE OR REPLACE FUNCTION public.auction_values(_room_id uuid)
RETURNS TABLE (loose_key text, dollars integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_view_room(_room_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  PERFORM public.ensure_auction_values(_room_id);
  RETURN QUERY SELECT c.loose_key, c.dollars FROM public.auction_value_cache c WHERE c.room_id = _room_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.compute_auction_values(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_auction_values(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auction_values(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_auction_values(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_auction_values(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auction_values(uuid) TO authenticated, service_role;

-- Bots bid up to the room's price for the player.
CREATE OR REPLACE FUNCTION public.auction_bot_bid_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _nom public.auction_nominations;
  _room public.draft_rooms;
  _seat record;
  _total_slots int;
  _team_picks int;
  _team_spent int;
  _remaining_slots int;
  _max_affordable int;
  _new_bid int;
  _target int;
  _value int;
  _new_deadline timestamptz;
  _antisnipe int;
  _bids_made int := 0;
  _bid_chance numeric;
BEGIN
  FOR _nom IN
    SELECT n.* FROM public.auction_nominations n
    JOIN public.draft_rooms r ON r.id = n.room_id
    WHERE n.status = 'active'
      AND now() < n.deadline
      AND r.status = 'drafting'
      AND r.draft_format IN ('auction','auction_slow')
    ORDER BY random()
  LOOP
    SELECT * INTO _room FROM public.draft_rooms WHERE id = _nom.room_id FOR UPDATE;

    -- The room's suggested price for this player (same numbers managers see).
    PERFORM public.ensure_auction_values(_room.id);
    SELECT dollars INTO _value FROM public.auction_value_cache
    WHERE room_id = _room.id AND loose_key = _nom.player_id;
    _value := COALESCE(_value, 1);

    -- Pick one random eligible bot/empty seat that isn't currently leading
    FOR _seat IN
      SELECT p.draft_position, p.user_id
      FROM public.draft_participants p
      WHERE p.room_id = _nom.room_id
        AND p.draft_position IS NOT NULL
        AND (p.user_id IS NULL OR p.is_bot = true)
        AND p.draft_position <> _nom.current_bidder_team_idx
      ORDER BY random()
    LOOP
      -- Each bot values each player a little differently (±15%), but
      -- consistently for the whole nomination, so bidding wars are natural.
      _target := GREATEST(
        COALESCE(_room.auction_min_bid, 1),
        ROUND(_value * (0.85 + (abs(hashtext(_nom.id::text || ':' || _seat.draft_position)) % 31) / 100.0))::int
      );
      _new_bid := _nom.current_bid + 1;
      IF _new_bid > _target THEN CONTINUE; END IF;

      _total_slots := public.auction_total_slots(_room);
      SELECT count(*) INTO _team_picks FROM public.draft_picks
        WHERE room_id = _nom.room_id AND team_idx = _seat.draft_position;
      IF _team_picks >= _total_slots THEN CONTINUE; END IF;

      SELECT COALESCE(SUM(COALESCE(auction_price, 0)), 0) INTO _team_spent
        FROM public.draft_picks
        WHERE room_id = _nom.room_id AND team_idx = _seat.draft_position;

      _remaining_slots := _total_slots - _team_picks;
      _max_affordable := (_room.auction_budget - _team_spent) - (_remaining_slots - 1);
      IF _new_bid > _max_affordable THEN CONTINUE; END IF;

      -- Probability gate: higher chance when current bid is far below target
      _bid_chance := LEAST(0.6, 0.15 + (_target - _new_bid)::numeric / GREATEST(_target, 1) * 0.5);
      IF random() > _bid_chance THEN CONTINUE; END IF;

      -- Compute new deadline (mirror auction_bid logic)
      _new_deadline := _nom.deadline;
      IF _room.draft_format = 'auction_slow' AND _room.auction_antisnipe_threshold_sec IS NOT NULL THEN
        _antisnipe := _room.auction_antisnipe_threshold_sec;
        IF EXTRACT(epoch FROM (_nom.deadline - now())) < _antisnipe THEN
          _new_deadline := now() + (_room.auction_bid_clock_sec || ' seconds')::interval;
        END IF;
      ELSIF _room.draft_format = 'auction_slow' THEN
        _new_deadline := now() + (_room.auction_bid_clock_sec || ' seconds')::interval;
      END IF;

      INSERT INTO public.auction_bids(room_id, nomination_id, team_idx, user_id, amount)
      VALUES (_nom.room_id, _nom.id, _seat.draft_position, _seat.user_id, _new_bid);

      UPDATE public.auction_nominations
      SET current_bid = _new_bid,
          current_bidder_team_idx = _seat.draft_position,
          current_bidder_user_id = _seat.user_id,
          deadline = _new_deadline
      WHERE id = _nom.id;

      _bids_made := _bids_made + 1;
      EXIT; -- only one bot bid per nomination per tick
    END LOOP;
  END LOOP;

  RETURN _bids_made;
END;
$function$;

-- Bots nominate from the top of the room's price list.
CREATE OR REPLACE FUNCTION public.auction_bot_nominate_due()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _room public.draft_rooms;
  _seat record;
  _player_id text;
  _player_name text;
  _player_position text;
  _player_team text;
  _nomination_number int;
  _opening_bid int;
  _active_count int;
  _team_active int;
  _team_total int;
  _team_picks int;
  _total_slots int;
  _per_team smallint;
  _quota smallint;
  _nominated int := 0;
  _max_active smallint;
  _progress boolean;
  _rookies_only boolean;
BEGIN
  FOR _room IN
    SELECT * FROM public.draft_rooms
    WHERE status = 'drafting' AND draft_format IN ('auction', 'auction_slow')
    FOR UPDATE
  LOOP
    _per_team := COALESCE(_room.auction_concurrent_per_team, 1);
    _quota := _room.auction_nominations_per_team;
    _max_active := COALESCE(_room.auction_max_concurrent_nominations, 1);
    _total_slots := public.auction_total_slots(_room);
    _rookies_only := COALESCE(_room.player_pool, 'all') = 'rookies';
    PERFORM public.ensure_auction_values(_room.id);

    LOOP
      _progress := false;

      SELECT count(*) INTO _active_count
      FROM public.auction_nominations
      WHERE room_id = _room.id AND status = 'active';
      IF _active_count >= _max_active THEN EXIT; END IF;

      FOR _seat IN
        SELECT p.draft_position, p.user_id, COALESCE(p.is_bot, false) AS is_bot
        FROM public.draft_participants p
        WHERE p.room_id = _room.id
          AND p.draft_position IS NOT NULL
          AND (p.user_id IS NULL OR p.is_bot = true)
        ORDER BY p.draft_position
      LOOP
        SELECT count(*) INTO _active_count
        FROM public.auction_nominations
        WHERE room_id = _room.id AND status = 'active';
        IF _active_count >= _max_active THEN EXIT; END IF;

        SELECT count(*) INTO _team_active FROM public.auction_nominations
          WHERE room_id = _room.id AND nominator_team_idx = _seat.draft_position AND status = 'active';
        IF _team_active >= _per_team THEN CONTINUE; END IF;

        SELECT count(*) INTO _team_picks FROM public.draft_picks
          WHERE room_id = _room.id AND team_idx = _seat.draft_position;
        IF _team_picks >= _total_slots THEN CONTINUE; END IF;

        IF _quota IS NOT NULL THEN
          SELECT count(*) INTO _team_total FROM public.auction_nominations
            WHERE room_id = _room.id AND nominator_team_idx = _seat.draft_position
              AND status IN ('active','awarded');
          IF _team_total >= _quota THEN CONTINUE; END IF;
        END IF;

        _player_id := NULL;

        -- One of the three most valuable available players (HoopRank order),
        -- so bot nominations follow the rankings without being predictable.
        SELECT pid, full_name, position, team_abbreviation
          INTO _player_id, _player_name, _player_position, _player_team
        FROM (
        SELECT
          COALESCE(p.loose_key, p.player_key) AS pid,
          p.full_name,
          p.position,
          p.team_abbreviation
        FROM public.players p
        JOIN public.auction_value_cache c
          ON c.room_id = _room.id
         AND c.loose_key = regexp_replace(lower(COALESCE(p.loose_key, p.player_key)), '[^a-z0-9]', '', 'g')
        WHERE p.is_active = true
          AND (NOT _rookies_only OR COALESCE(p.is_rookie, false))
          AND NOT EXISTS (
            SELECT 1 FROM public.draft_picks dp
            WHERE dp.room_id = _room.id AND dp.player_id = COALESCE(p.loose_key, p.player_key)
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.auction_nominations an
            WHERE an.room_id = _room.id AND an.status = 'active'
              AND an.player_id = COALESCE(p.loose_key, p.player_key)
          )
        ORDER BY c.pos
        LIMIT 3
        ) top3
        ORDER BY random()
        LIMIT 1;

        IF _player_id IS NULL THEN EXIT; END IF;

        _opening_bid := GREATEST(COALESCE(_room.auction_min_bid, 1), 1);
        _nomination_number := COALESCE((SELECT max(nomination_number) FROM public.auction_nominations
                                          WHERE room_id = _room.id), 0) + 1;

        INSERT INTO public.auction_nominations(
          room_id, nomination_number, nominator_team_idx,
          player_id, player_name, player_position, player_team,
          opening_bid, current_bid, current_bidder_team_idx, current_bidder_user_id,
          deadline, status
        ) VALUES (
          _room.id, _nomination_number, _seat.draft_position,
          _player_id, _player_name, _player_position, _player_team,
          _opening_bid, _opening_bid, _seat.draft_position, _seat.user_id,
          now() + (_room.auction_bid_clock_sec || ' seconds')::interval, 'active'
        );

        INSERT INTO public.auction_bids(room_id, nomination_id, team_idx, user_id, amount, is_opening)
        SELECT _room.id, id, _seat.draft_position, _seat.user_id, _opening_bid, true
        FROM public.auction_nominations
        WHERE room_id = _room.id AND nomination_number = _nomination_number;

        _nominated := _nominated + 1;
        _progress := true;
      END LOOP;

      EXIT WHEN NOT _progress;
    END LOOP;
  END LOOP;

  RETURN _nominated;
END;
$function$;
