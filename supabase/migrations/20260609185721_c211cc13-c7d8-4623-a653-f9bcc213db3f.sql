
CREATE OR REPLACE FUNCTION public.draft_picks_cleanup_queues()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.draft_queues
  WHERE room_id = NEW.room_id AND player_id = NEW.player_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS draft_picks_cleanup_queues_trg ON public.draft_picks;
CREATE TRIGGER draft_picks_cleanup_queues_trg
AFTER INSERT ON public.draft_picks
FOR EACH ROW EXECUTE FUNCTION public.draft_picks_cleanup_queues();
