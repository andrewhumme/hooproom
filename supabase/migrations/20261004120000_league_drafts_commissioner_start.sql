-- League drafts no longer start themselves at their scheduled time. The
-- commissioner starts them after reviewing teams, draft order and pick trades
-- (the Start draft confirmation). The scheduled time is now when managers are
-- told it's draft time. Mock drafts keep their lobby auto-start timer.
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
    SELECT id FROM public.draft_rooms
    WHERE status = 'waiting'
      AND room_type = 'mock'
      AND auto_start_at IS NOT NULL
      AND now() >= auto_start_at
  LOOP
    BEGIN
      PERFORM public.auto_fill_and_start(_r.id, true);
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_fill_and_start failed for room %: %', _r.id, SQLERRM;
    END;
  END LOOP;
  RETURN _count;
END;
$function$;
