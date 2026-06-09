
ALTER TABLE public.draft_rooms ADD COLUMN IF NOT EXISTS paused_remaining_ms bigint;
ALTER TABLE public.auction_nominations ADD COLUMN IF NOT EXISTS paused_remaining_ms bigint;

CREATE OR REPLACE FUNCTION public.pause_draft(_room_id uuid)
 RETURNS draft_rooms
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _room public.draft_rooms;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can pause'; END IF;
  IF _room.status <> 'drafting' THEN RAISE EXCEPTION 'Draft is not active'; END IF;

  -- Snapshot remaining ms on the snake pick clock (clamp at 0)
  UPDATE public.draft_rooms
  SET status = 'paused',
      paused_at = now(),
      paused_remaining_ms = CASE
        WHEN pick_deadline IS NULL THEN NULL
        ELSE GREATEST(0, (EXTRACT(epoch FROM (pick_deadline - now())) * 1000)::bigint)
      END
  WHERE id = _room_id
  RETURNING * INTO _room;

  -- Snapshot remaining ms on each active auction nomination
  UPDATE public.auction_nominations
  SET paused_remaining_ms = GREATEST(0, (EXTRACT(epoch FROM (deadline - now())) * 1000)::bigint)
  WHERE room_id = _room_id AND status = 'active';

  RETURN _room;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resume_draft(_room_id uuid)
 RETURNS draft_rooms
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _room public.draft_rooms;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can resume'; END IF;
  IF _room.status <> 'paused' THEN RAISE EXCEPTION 'Draft is not paused'; END IF;

  -- Restart the snake pick clock from the snapshot remaining
  UPDATE public.draft_rooms
  SET status = 'drafting',
      paused_at = NULL,
      pick_deadline = CASE
        WHEN paused_remaining_ms IS NULL THEN pick_deadline
        ELSE now() + (paused_remaining_ms || ' milliseconds')::interval
      END,
      paused_remaining_ms = NULL
  WHERE id = _room_id
  RETURNING * INTO _room;

  -- Restart each active auction nomination from its snapshot
  UPDATE public.auction_nominations
  SET deadline = now() + (paused_remaining_ms || ' milliseconds')::interval,
      paused_remaining_ms = NULL
  WHERE room_id = _room_id AND status = 'active' AND paused_remaining_ms IS NOT NULL;

  RETURN _room;
END;
$function$;
