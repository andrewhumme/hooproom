
-- Bot seats: let host fill empty seats with bots so a draft can run end-to-end
-- with one human, especially useful for testing slow auctions.

ALTER TABLE public.draft_participants
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

-- Host adds a bot to the next open seat in a waiting room.
CREATE OR REPLACE FUNCTION public.add_bot_seat(_room_id uuid)
RETURNS public.draft_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _bot_id uuid := gen_random_uuid();
  _bot_count int;
  _participant_count int;
  _new public.draft_participants;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can add bots'; END IF;
  IF _room.status <> 'waiting' THEN RAISE EXCEPTION 'Bots can only be added before the draft starts'; END IF;

  SELECT count(*) INTO _participant_count FROM public.draft_participants WHERE room_id = _room_id;
  IF _participant_count >= _room.team_count THEN RAISE EXCEPTION 'Room is full'; END IF;

  SELECT count(*) INTO _bot_count FROM public.draft_participants WHERE room_id = _room_id AND is_bot = true;

  INSERT INTO public.draft_participants(room_id, user_id, team_name, is_bot)
  VALUES (_room_id, _bot_id, 'Bot ' || (_bot_count + 1), true)
  RETURNING * INTO _new;

  RETURN _new;
END;
$$;

-- Host removes a bot from a waiting room.
CREATE OR REPLACE FUNCTION public.remove_bot_seat(_participant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p public.draft_participants;
  _room public.draft_rooms;
BEGIN
  SELECT * INTO _p FROM public.draft_participants WHERE id = _participant_id;
  IF _p IS NULL THEN RAISE EXCEPTION 'Participant not found'; END IF;
  IF _p.is_bot IS NOT true THEN RAISE EXCEPTION 'Not a bot seat'; END IF;
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _p.room_id;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can remove bots'; END IF;
  IF _room.status <> 'waiting' THEN RAISE EXCEPTION 'Bots can only be removed before the draft starts'; END IF;
  DELETE FROM public.draft_participants WHERE id = _participant_id;
END;
$$;

-- Auction: for any active auction room, if the next nominator is a bot or an
-- empty seat, auto-nominate the best available player at the minimum bid.
-- Runs from the existing /api/public/auction-tick cron.
CREATE OR REPLACE FUNCTION public.auction_bot_nominate_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _next_team smallint;
  _expected_user uuid;
  _is_bot_seat boolean;
  _player_id text;
  _player_name text;
  _player_position text;
  _player_team text;
  _nomination_number int;
  _opening_bid int;
  _active_count int;
  _nominated int := 0;
  _loops int;
BEGIN
  FOR _room IN
    SELECT * FROM public.draft_rooms
    WHERE status = 'drafting' AND draft_format IN ('auction', 'auction_slow')
    FOR UPDATE
  LOOP
    -- Chain through consecutive bot/empty nominators (up to team_count per tick)
    _loops := 0;
    LOOP
      _loops := _loops + 1;
      IF _loops > _room.team_count THEN EXIT; END IF;

      SELECT count(*) INTO _active_count
      FROM public.auction_nominations
      WHERE room_id = _room.id AND status = 'active';
      IF _active_count >= COALESCE(_room.auction_max_concurrent_nominations, 1) THEN EXIT; END IF;

      _next_team := public.auction_next_nominator(_room.id);
      IF _next_team IS NULL THEN EXIT; END IF;

      SELECT p.user_id, COALESCE(p.is_bot, false)
        INTO _expected_user, _is_bot_seat
      FROM public.draft_participants p
      WHERE p.room_id = _room.id AND p.draft_position = _next_team;

      -- Stop if next nominator is a real human seat
      IF _expected_user IS NOT NULL AND _is_bot_seat IS NOT true THEN EXIT; END IF;

      -- Find best available player not on the block and not drafted
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
        AND NOT EXISTS (
          SELECT 1 FROM public.auction_nominations an
          WHERE an.room_id = _room.id AND an.status = 'active'
            AND an.player_id = COALESCE(p.loose_key, p.player_key)
        )
      ORDER BY COALESCE(s.minutes_per_game, 0) DESC NULLS LAST,
               COALESCE(s.pts, 0) DESC NULLS LAST
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
        _room.id, _nomination_number, _next_team,
        _player_id, _player_name, _player_position, _player_team,
        _opening_bid, _opening_bid, _next_team, _expected_user,
        now() + (_room.auction_bid_clock_sec || ' seconds')::interval, 'active'
      );

      INSERT INTO public.auction_bids(room_id, nomination_id, team_idx, user_id, amount, is_opening)
      SELECT _room.id, id, _next_team, _expected_user, _opening_bid, true
      FROM public.auction_nominations
      WHERE room_id = _room.id AND nomination_number = _nomination_number;

      _nominated := _nominated + 1;
    END LOOP;
  END LOOP;

  RETURN _nominated;
END;
$$;
