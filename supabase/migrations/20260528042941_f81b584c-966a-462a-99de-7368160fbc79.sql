
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
  _mpg numeric;
  _pts numeric;
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

    -- Compute a target value from current-season stats (loose heuristic)
    SELECT s.minutes_per_game, s.pts INTO _mpg, _pts
    FROM public.players p
    LEFT JOIN public.player_season_stats s
      ON s.loose_key = p.loose_key AND s.season = 2025
    WHERE COALESCE(p.loose_key, p.player_key) = _nom.player_id
    LIMIT 1;

    -- Target ~ 0.7 * mpg + 0.5 * pts, clamped. Star (~36mpg/28pts) ≈ 39, role player ≈ 5-10
    _target := GREATEST(
      _room.auction_min_bid,
      LEAST(
        _room.auction_budget / 3,
        CEIL(COALESCE(_mpg, 12) * 0.7 + COALESCE(_pts, 6) * 0.5)::int
      )
    );

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
