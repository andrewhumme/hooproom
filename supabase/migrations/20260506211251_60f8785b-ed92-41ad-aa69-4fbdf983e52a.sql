
-- Add 'paused' status and pause tracking
ALTER TABLE public.draft_rooms DROP CONSTRAINT IF EXISTS draft_rooms_status_check;
ALTER TABLE public.draft_rooms ADD CONSTRAINT draft_rooms_status_check
  CHECK (status = ANY (ARRAY['waiting'::text, 'drafting'::text, 'paused'::text, 'complete'::text]));

ALTER TABLE public.draft_rooms ADD COLUMN IF NOT EXISTS paused_at timestamptz;

-- Pause RPC: host-only. Freezes timers by clearing pick_deadline and recording paused_at.
CREATE OR REPLACE FUNCTION public.pause_draft(_room_id uuid)
RETURNS public.draft_rooms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _room public.draft_rooms;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can pause'; END IF;
  IF _room.status <> 'drafting' THEN RAISE EXCEPTION 'Draft is not active'; END IF;

  UPDATE public.draft_rooms
  SET status = 'paused',
      paused_at = now(),
      pick_deadline = pick_deadline  -- keep stored value; we'll shift on resume
  WHERE id = _room_id
  RETURNING * INTO _room;
  RETURN _room;
END;
$$;

-- Resume RPC: shifts all timers forward by the paused duration.
CREATE OR REPLACE FUNCTION public.resume_draft(_room_id uuid)
RETURNS public.draft_rooms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _delta interval;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can resume'; END IF;
  IF _room.status <> 'paused' THEN RAISE EXCEPTION 'Draft is not paused'; END IF;
  IF _room.paused_at IS NULL THEN
    _delta := '0 seconds'::interval;
  ELSE
    _delta := now() - _room.paused_at;
  END IF;

  -- Shift snake pick deadline
  UPDATE public.draft_rooms
  SET status = 'drafting',
      paused_at = NULL,
      pick_deadline = CASE WHEN pick_deadline IS NULL THEN NULL ELSE pick_deadline + _delta END
  WHERE id = _room_id
  RETURNING * INTO _room;

  -- Shift active auction nomination deadlines
  UPDATE public.auction_nominations
  SET deadline = deadline + _delta
  WHERE room_id = _room_id AND status = 'active';

  RETURN _room;
END;
$$;
