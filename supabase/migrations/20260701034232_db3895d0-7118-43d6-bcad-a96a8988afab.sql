
-- 1. Add columns
ALTER TABLE public.draft_rooms
  ADD COLUMN IF NOT EXISTS room_type text NOT NULL DEFAULT 'mock',
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz NULL;

ALTER TABLE public.draft_rooms
  DROP CONSTRAINT IF EXISTS draft_rooms_room_type_check;
ALTER TABLE public.draft_rooms
  ADD CONSTRAINT draft_rooms_room_type_check CHECK (room_type IN ('mock','league'));

-- 2. Restrict auto-start job to mock rooms only. League rooms never auto-fill/start.
CREATE OR REPLACE FUNCTION public.lobby_autostart_due()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _count int := 0;
BEGIN
  FOR _r IN
    SELECT id FROM public.draft_rooms
    WHERE status = 'waiting'
      AND room_type = 'mock'
      AND auto_start_at IS NOT NULL
      AND now() >= auto_start_at
  LOOP
    BEGIN
      PERFORM public.auto_fill_and_start(_r.id);
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Don't let one bad room block the loop
      RAISE WARNING 'auto_fill_and_start failed for room %: %', _r.id, SQLERRM;
    END;
  END LOOP;
  RETURN _count;
END;
$function$;

-- 3. When a mock room fills up, squeeze the auto-start to +10 seconds so the
--    draft kicks off almost immediately once everyone is in.
CREATE OR REPLACE FUNCTION public.squeeze_full_lobby()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _room public.draft_rooms;
  _human_count int;
  _squeeze_at timestamptz := now() + interval '10 seconds';
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = NEW.room_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF _room.status <> 'waiting' OR _room.room_type <> 'mock' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _human_count
  FROM public.draft_participants
  WHERE room_id = NEW.room_id AND COALESCE(is_bot, false) = false;

  IF _human_count >= _room.team_count THEN
    UPDATE public.draft_rooms
       SET auto_start_at = _squeeze_at
     WHERE id = NEW.room_id
       AND status = 'waiting'
       AND (auto_start_at IS NULL OR auto_start_at > _squeeze_at);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_squeeze_full_lobby ON public.draft_participants;
CREATE TRIGGER trg_squeeze_full_lobby
AFTER INSERT ON public.draft_participants
FOR EACH ROW EXECUTE FUNCTION public.squeeze_full_lobby();
