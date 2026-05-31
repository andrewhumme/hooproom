ALTER TABLE public.room_keepers REPLICA IDENTITY FULL;
ALTER TABLE public.draft_pick_assignments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_keepers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_pick_assignments;