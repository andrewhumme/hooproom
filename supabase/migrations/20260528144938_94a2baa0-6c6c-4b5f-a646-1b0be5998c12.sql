
-- Add auto-start deadline to lobby
ALTER TABLE public.draft_rooms
  ADD COLUMN IF NOT EXISTS auto_start_at timestamptz;

-- Auto-fill empty seats with bots, then start the draft (snake or auction)
CREATE OR REPLACE FUNCTION public.auto_fill_and_start(_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _participant_count int;
  _bot_count int;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.status <> 'waiting' THEN RETURN; END IF;

  SELECT count(*) INTO _participant_count FROM public.draft_participants WHERE room_id = _room_id;
  IF _participant_count = 0 THEN
    -- Nobody joined (not even the host); leave room as-is.
    RETURN;
  END IF;

  SELECT count(*) INTO _bot_count FROM public.draft_participants
    WHERE room_id = _room_id AND is_bot = true;

  WHILE _participant_count < _room.team_count LOOP
    _bot_count := _bot_count + 1;
    INSERT INTO public.draft_participants(room_id, user_id, team_name, is_bot)
    VALUES (_room_id, gen_random_uuid(), 'Bot ' || _bot_count, true);
    _participant_count := _participant_count + 1;
  END LOOP;

  -- Randomize draft positions across all seats
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS pos
    FROM public.draft_participants WHERE room_id = _room_id
  )
  UPDATE public.draft_participants p
  SET draft_position = o.pos
  FROM ordered o WHERE p.id = o.id;

  IF _room.draft_format IN ('auction','auction_slow') THEN
    UPDATE public.draft_rooms
    SET status = 'drafting',
        current_pick_number = 1,
        pick_deadline = NULL,
        started_at = now(),
        auto_start_at = NULL
    WHERE id = _room_id;
  ELSE
    UPDATE public.draft_rooms
    SET status = 'drafting',
        current_pick_number = 1,
        pick_deadline = now() + (_room.pick_clock_sec || ' seconds')::interval,
        started_at = now(),
        auto_start_at = NULL
    WHERE id = _room_id;
  END IF;
END;
$$;

-- Host-callable wrapper (enforces host check, then fills + starts)
CREATE OR REPLACE FUNCTION public.host_start_with_bots(_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _room public.draft_rooms;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can start'; END IF;
  IF _room.status <> 'waiting' THEN RAISE EXCEPTION 'Draft already started'; END IF;
  PERFORM public.auto_fill_and_start(_room_id);
END;
$$;

-- Tick: auto-start any waiting room whose lobby timer has expired
CREATE OR REPLACE FUNCTION public.lobby_autostart_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r record;
  _count int := 0;
BEGIN
  FOR _r IN
    SELECT id FROM public.draft_rooms
    WHERE status = 'waiting'
      AND auto_start_at IS NOT NULL
      AND now() >= auto_start_at
  LOOP
    PERFORM public.auto_fill_and_start(_r.id);
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

-- Schedule the lobby tick every minute
SELECT cron.schedule(
  'lobby-autostart-tick',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--46312d31-45d5-4004-ad9d-f467b5bea016.lovable.app/api/public/lobby-tick',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhbXdjY2xoeWJtcmF2aHp1bW55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzMyNTUsImV4cCI6MjA5MjcwOTI1NX0.IpTX0Q3qaxXcd2AbTeyr7Y8ONeauCoZz-q-jZxfb3CQ"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);
