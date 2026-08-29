ALTER TABLE public.draft_rooms ADD COLUMN IF NOT EXISTS recap_sent_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.cleanup_completed_mock_drafts(_grace_hours INTEGER DEFAULT 12)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _ids UUID[];
  _n INTEGER;
BEGIN
  SELECT array_agg(id) INTO _ids
  FROM public.draft_rooms
  WHERE room_type = 'mock'
    AND status = 'completed'
    AND completed_at IS NOT NULL
    AND completed_at < now() - make_interval(hours => _grace_hours);

  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.auction_bids WHERE room_id = ANY(_ids);
  DELETE FROM public.auction_nominations WHERE room_id = ANY(_ids);
  DELETE FROM public.draft_picks WHERE room_id = ANY(_ids);
  DELETE FROM public.draft_queues WHERE room_id = ANY(_ids);
  DELETE FROM public.draft_pick_assignments WHERE room_id = ANY(_ids);
  DELETE FROM public.room_keepers WHERE room_id = ANY(_ids);
  DELETE FROM public.draft_participant_contacts WHERE room_id = ANY(_ids);
  DELETE FROM public.draft_participants WHERE room_id = ANY(_ids);
  DELETE FROM public.draft_rooms WHERE id = ANY(_ids);

  _n := array_length(_ids, 1);
  RETURN _n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_completed_mock_drafts(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_completed_mock_drafts(INTEGER) TO service_role;

SELECT cron.schedule(
  'cleanup-completed-mock-drafts',
  '0 8 * * *',
  $$SELECT public.cleanup_completed_mock_drafts(12);$$
);