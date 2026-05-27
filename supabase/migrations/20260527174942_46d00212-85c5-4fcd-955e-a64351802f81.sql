-- Loosen auction_nominate so any team under their caps can nominate concurrently,
-- instead of being gated to strict snake turn order. This lets the pool fill
-- up at draft start when concurrent_per_team > 1.
CREATE OR REPLACE FUNCTION public.auction_nominate(_room_id uuid, _player_id text, _player_name text, _player_position text, _player_team text, _opening_bid integer)
 RETURNS auction_nominations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _room public.draft_rooms;
  _my_team smallint;
  _expected_user uuid;
  _total_slots int;
  _team_picks int;
  _team_spent int;
  _remaining_slots int;
  _max_affordable int;
  _nom public.auction_nominations;
  _nomination_number int;
  _active_count int;
  _team_active int;
  _team_total_noms int;
  _per_team smallint;
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then raise exception 'Room not found'; end if;
  if _room.status <> 'drafting' then raise exception 'Auction not active'; end if;
  if _room.draft_format not in ('auction','auction_slow') then
    raise exception 'Not an auction draft';
  end if;
  _per_team := coalesce(_room.auction_concurrent_per_team, 1);

  -- Caller must be a participant
  select draft_position into _my_team
  from public.draft_participants
  where room_id = _room_id and user_id = auth.uid();
  if _my_team is null then raise exception 'You are not in this draft'; end if;
  _expected_user := auth.uid();

  -- Room-wide concurrent cap
  select count(*) into _active_count
  from public.auction_nominations
  where room_id = _room_id and status = 'active';
  if _active_count >= coalesce(_room.auction_max_concurrent_nominations, 1) then
    raise exception 'Max concurrent nominations reached (% of %)',
      _active_count, _room.auction_max_concurrent_nominations;
  end if;

  -- Per-team concurrent cap
  select count(*) into _team_active from public.auction_nominations
    where room_id = _room_id and nominator_team_idx = _my_team and status = 'active';
  if _team_active >= _per_team then
    raise exception 'You already have % active nomination(s) — wait for one to be awarded', _team_active;
  end if;

  -- Per-team total quota
  if _room.auction_nominations_per_team is not null then
    select count(*) into _team_total_noms from public.auction_nominations
      where room_id = _room_id and nominator_team_idx = _my_team
        and status in ('active','awarded');
    if _team_total_noms >= _room.auction_nominations_per_team then
      raise exception 'You have used all % nominations', _room.auction_nominations_per_team;
    end if;
  end if;

  if exists (select 1 from public.draft_picks
             where room_id = _room_id and player_id = _player_id) then
    raise exception 'Player already drafted';
  end if;
  if exists (select 1 from public.auction_nominations
             where room_id = _room_id and player_id = _player_id and status = 'active') then
    raise exception 'Player already on the block';
  end if;

  _total_slots := public.auction_total_slots(_room);
  select count(*) into _team_picks from public.draft_picks
    where room_id = _room_id and team_idx = _my_team;
  select coalesce(sum(coalesce(auction_price,0)),0) into _team_spent
    from public.draft_picks
    where room_id = _room_id and team_idx = _my_team;

  _remaining_slots := _total_slots - _team_picks;
  if _remaining_slots <= 0 then raise exception 'Roster full'; end if;

  if _opening_bid < _room.auction_min_bid then
    raise exception 'Opening bid below minimum (%)', _room.auction_min_bid;
  end if;

  _max_affordable := (_room.auction_budget - _team_spent) - (_remaining_slots - 1);
  if _opening_bid > _max_affordable then
    raise exception 'Bid exceeds max affordable ($%)', _max_affordable;
  end if;

  _nomination_number := coalesce((select max(nomination_number) from public.auction_nominations
                                   where room_id = _room_id), 0) + 1;

  insert into public.auction_nominations(
    room_id, nomination_number, nominator_team_idx,
    player_id, player_name, player_position, player_team,
    opening_bid, current_bid, current_bidder_team_idx, current_bidder_user_id,
    deadline, status
  ) values (
    _room_id, _nomination_number, _my_team,
    _player_id, _player_name, _player_position, _player_team,
    _opening_bid, _opening_bid, _my_team, _expected_user,
    now() + (_room.auction_bid_clock_sec || ' seconds')::interval, 'active'
  ) returning * into _nom;

  insert into public.auction_bids(room_id, nomination_id, team_idx, user_id, amount, is_opening)
  values (_room_id, _nom.id, _my_team, _expected_user, _opening_bid, true);

  return _nom;
end;
$function$;

-- auction_bot_nominate_due: fill bot/empty seats up to the room-wide cap,
-- respecting per-team caps. Iterate over participants (bots + empty) instead
-- of snake order so the pool fills quickly at draft start.
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

    -- Keep looping until no bot/empty seat made progress this pass
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
        -- Re-check global cap each iteration
        SELECT count(*) INTO _active_count
        FROM public.auction_nominations
        WHERE room_id = _room.id AND status = 'active';
        IF _active_count >= _max_active THEN EXIT; END IF;

        -- Per-team caps
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

        -- Best available player
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