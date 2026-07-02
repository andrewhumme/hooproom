CREATE OR REPLACE FUNCTION public.host_set_pick_clock(
  _room_id uuid,
  _seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms%ROWTYPE;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;
  IF _room.host_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the host can change the pick clock';
  END IF;
  IF _seconds < 15 OR _seconds > 259200 THEN
    RAISE EXCEPTION 'Pick clock must be between 15 seconds and 72 hours';
  END IF;

  UPDATE public.draft_rooms
     SET pick_clock_sec = _seconds
   WHERE id = _room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.host_set_pick_clock(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.host_set_pick_clock(uuid, integer) TO authenticated;