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