ALTER TABLE public.draft_rooms ADD COLUMN IF NOT EXISTS warmup_until timestamp with time zone;

-- Block picks during warm-up
CREATE OR REPLACE FUNCTION public.block_picks_during_warmup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _w timestamptz;
BEGIN
  SELECT warmup_until INTO _w FROM public.draft_rooms WHERE id = NEW.room_id;
  IF _w IS NOT NULL AND now() < _w THEN
    RAISE EXCEPTION 'Draft starts in % seconds', ceil(extract(epoch from (_w - now())));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS draft_picks_block_warmup ON public.draft_picks;
CREATE TRIGGER draft_picks_block_warmup
BEFORE INSERT ON public.draft_picks
FOR EACH ROW EXECUTE FUNCTION public.block_picks_during_warmup();

-- Silently skip nominations during warm-up (bots poll continuously)
CREATE OR REPLACE FUNCTION public.skip_nominations_during_warmup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _w timestamptz;
BEGIN
  SELECT warmup_until INTO _w FROM public.draft_rooms WHERE id = NEW.room_id;
  IF _w IS NOT NULL AND now() < _w THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auction_nominations_block_warmup ON public.auction_nominations;
CREATE TRIGGER auction_nominations_block_warmup
BEFORE INSERT ON public.auction_nominations
FOR EACH ROW EXECUTE FUNCTION public.skip_nominations_during_warmup();

-- start_draft: add warm-up
CREATE OR REPLACE FUNCTION public.start_draft(_room_id uuid)
RETURNS draft_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _room public.draft_rooms;
  _participant_count int;
  _warm interval := interval '2 minutes';
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can start the draft'; END IF;
  IF _room.status <> 'waiting' THEN RAISE EXCEPTION 'Draft already started'; END IF;

  SELECT count(*) INTO _participant_count FROM public.draft_participants WHERE room_id = _room_id;
  IF _participant_count = 0 THEN RAISE EXCEPTION 'Need at least one participant to start'; END IF;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS pos
    FROM public.draft_participants WHERE room_id = _room_id
  )
  UPDATE public.draft_participants p
  SET draft_position = o.pos
  FROM ordered o WHERE p.id = o.id;

  UPDATE public.draft_rooms
  SET status = 'drafting', current_pick_number = 1,
      warmup_until = now() + _warm,
      pick_deadline = now() + _warm + (_room.pick_clock_sec || ' seconds')::interval,
      started_at = now()
  WHERE id = _room_id
  RETURNING * INTO _room;

  UPDATE public.draft_rooms SET warmup_until = NULL WHERE id = _room_id;
  PERFORM public.insert_room_keepers(_room_id);
  IF EXISTS(SELECT 1 FROM public.draft_picks WHERE room_id = _room_id AND pick_number = 1) THEN
    UPDATE public.draft_rooms SET current_pick_number = 0 WHERE id = _room_id;
    PERFORM public.advance_past_keepers(_room_id);
  END IF;
  UPDATE public.draft_rooms SET warmup_until = now() + _warm WHERE id = _room_id
  RETURNING * INTO _room;

  RETURN _room;
END;
$function$;

-- auction_start: add warm-up
CREATE OR REPLACE FUNCTION public.auction_start(_room_id uuid)
RETURNS draft_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  _room public.draft_rooms;
  _participant_count int;
  _warm interval := interval '2 minutes';
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then raise exception 'Room not found'; end if;
  if _room.host_user_id <> auth.uid() then raise exception 'Only host can start'; end if;
  if _room.status <> 'waiting' then raise exception 'Draft already started'; end if;
  if _room.draft_format not in ('auction','auction_slow') then
    raise exception 'Not an auction draft';
  end if;

  select count(*) into _participant_count
  from public.draft_participants where room_id = _room_id;
  if _participant_count = 0 then raise exception 'Need at least one participant'; end if;

  with ordered as (
    select id, row_number() over (order by random()) as pos
    from public.draft_participants where room_id = _room_id
  )
  update public.draft_participants p
  set draft_position = o.pos
  from ordered o where p.id = o.id;

  update public.draft_rooms
  set status = 'drafting',
      current_pick_number = 1,
      pick_deadline = null,
      warmup_until = null,
      started_at = now()
  where id = _room_id;

  perform public.insert_auction_keepers(_room_id);

  update public.draft_rooms set warmup_until = now() + _warm
  where id = _room_id returning * into _room;

  return _room;
end;
$function$;

-- auto_fill_and_start: optional bot fill + warm-up
DROP FUNCTION IF EXISTS public.auto_fill_and_start(uuid);
CREATE OR REPLACE FUNCTION public.auto_fill_and_start(_room_id uuid, _fill_bots boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _room public.draft_rooms;
  _participant_count int;
  _bot_count int;
  _warm interval := interval '2 minutes';
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.status <> 'waiting' THEN RETURN; END IF;

  SELECT count(*) INTO _participant_count FROM public.draft_participants WHERE room_id = _room_id;
  IF _participant_count = 0 THEN RETURN; END IF;

  SELECT count(*) INTO _bot_count FROM public.draft_participants
    WHERE room_id = _room_id AND is_bot = true;

  IF _fill_bots THEN
    WHILE _participant_count < _room.team_count LOOP
      _bot_count := _bot_count + 1;
      INSERT INTO public.draft_participants(room_id, user_id, team_name, is_bot)
      VALUES (_room_id, gen_random_uuid(), 'Bot ' || _bot_count, true);
      _participant_count := _participant_count + 1;
    END LOOP;
  END IF;

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
        auto_start_at = NULL,
        warmup_until = now() + _warm
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
        pick_deadline = now() + _warm + (_room.pick_clock_sec || ' seconds')::interval,
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

    UPDATE public.draft_rooms SET warmup_until = now() + _warm WHERE id = _room_id;
  END IF;
END;
$function$;

-- lobby autostart: mock rooms by auto_start_at, league rooms by scheduled_start_at (no bots)
CREATE OR REPLACE FUNCTION public.lobby_autostart_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _r record;
  _count int := 0;
BEGIN
  FOR _r IN
    SELECT id, true AS fill_bots FROM public.draft_rooms
    WHERE status = 'waiting'
      AND room_type = 'mock'
      AND auto_start_at IS NOT NULL
      AND now() >= auto_start_at
    UNION ALL
    SELECT id, false FROM public.draft_rooms
    WHERE status = 'waiting'
      AND room_type <> 'mock'
      AND draft_mode = 'online'
      AND scheduled_start_at IS NOT NULL
      AND now() >= scheduled_start_at
  LOOP
    BEGIN
      PERFORM public.auto_fill_and_start(_r.id, _r.fill_bots);
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_fill_and_start failed for room %: %', _r.id, SQLERRM;
    END;
  END LOOP;
  RETURN _count;
END;
$function$;