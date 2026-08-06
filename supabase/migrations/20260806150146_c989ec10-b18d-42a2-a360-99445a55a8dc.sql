CREATE OR REPLACE FUNCTION public.auto_fill_and_start(_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _room public.draft_rooms;
  _participant_count int;
  _bot_count int;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.status <> 'waiting' THEN RETURN; END IF;

  SELECT count(*) INTO _participant_count FROM public.draft_participants WHERE room_id = _room_id;
  IF _participant_count = 0 THEN RETURN; END IF;

  SELECT count(*) INTO _bot_count FROM public.draft_participants
    WHERE room_id = _room_id AND is_bot = true;

  WHILE _participant_count < _room.team_count LOOP
    _bot_count := _bot_count + 1;
    INSERT INTO public.draft_participants(room_id, user_id, team_name, is_bot)
    VALUES (_room_id, gen_random_uuid(), 'Bot ' || _bot_count, true);
    _participant_count := _participant_count + 1;
  END LOOP;

  WITH missing AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS rn
    FROM public.draft_participants
    WHERE room_id = _room_id AND draft_position IS NULL
  ),
  open_slots AS (
    SELECT s.pos, row_number() OVER (ORDER BY random()) AS rn
    FROM generate_series(1, _room.team_count) s(pos)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.draft_participants p
      WHERE p.room_id = _room_id AND p.draft_position = s.pos
    )
  )
  UPDATE public.draft_participants p
  SET draft_position = o.pos
  FROM missing m JOIN open_slots o ON o.rn = m.rn
  WHERE p.id = m.id;

  IF _room.draft_format IN ('auction','auction_slow') THEN
    BEGIN
      PERFORM public.insert_auction_keepers(_room_id);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;

    UPDATE public.draft_rooms
    SET status = 'drafting',
        current_pick_number = 1,
        pick_deadline = NULL,
        started_at = now(),
        auto_start_at = NULL
    WHERE id = _room_id;
  ELSE
    BEGIN
      PERFORM public.insert_room_keepers(_room_id);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;

    UPDATE public.draft_rooms
    SET status = 'drafting',
        current_pick_number = 1,
        pick_deadline = now() + (_room.pick_clock_sec || ' seconds')::interval,
        started_at = now(),
        auto_start_at = NULL
    WHERE id = _room_id;

    IF EXISTS(SELECT 1 FROM public.draft_picks WHERE room_id = _room_id AND pick_number = 1) THEN
      UPDATE public.draft_rooms SET current_pick_number = 0 WHERE id = _room_id;
      BEGIN
        PERFORM public.advance_past_keepers(_room_id);
      EXCEPTION WHEN undefined_function THEN
        NULL;
      END;
    END IF;
  END IF;
END;
$function$;

-- Allow insert_auction_keepers to run for rooms already drafting (backfill safety)
CREATE OR REPLACE FUNCTION public.insert_auction_keepers(_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _room public.draft_rooms;
  _k record;
  _pick_no int;
  _user_id uuid;
  _team_picks int;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id;
  IF _room IS NULL OR NOT _room.keepers_enabled THEN RETURN; END IF;
  IF _room.draft_format NOT IN ('auction','auction_slow') THEN RETURN; END IF;

  FOR _k IN
    SELECT * FROM public.room_keepers
    WHERE room_id = _room_id
    ORDER BY team_idx, created_at
  LOOP
    IF EXISTS(SELECT 1 FROM public.draft_picks WHERE room_id = _room_id AND player_id = _k.player_id) THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS(SELECT 1 FROM public.draft_participants
                  WHERE room_id = _room_id AND draft_position = _k.team_idx) THEN
      CONTINUE;
    END IF;

    SELECT user_id INTO _user_id
    FROM public.draft_participants
    WHERE room_id = _room_id AND draft_position = _k.team_idx;

    SELECT coalesce(max(pick_number),0) + 1 INTO _pick_no
    FROM public.draft_picks WHERE room_id = _room_id;

    SELECT count(*) INTO _team_picks FROM public.draft_picks
    WHERE room_id = _room_id AND team_idx = _k.team_idx;

    INSERT INTO public.draft_picks(
      room_id, pick_number, round, team_idx, user_id,
      player_id, player_name, player_position, player_team,
      was_autopick, was_keeper, auction_price
    ) VALUES (
      _room_id, _pick_no, (_team_picks + 1)::smallint, _k.team_idx, _user_id,
      _k.player_id, _k.player_name, _k.player_position, _k.player_team,
      false, true, coalesce(_k.keeper_price, 0)
    );
  END LOOP;
END;
$function$;