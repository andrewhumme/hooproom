ALTER TABLE public.draft_rooms DROP CONSTRAINT draft_rooms_pick_clock_sec_check;
ALTER TABLE public.draft_rooms ADD CONSTRAINT draft_rooms_pick_clock_sec_check
CHECK (pick_clock_sec >= 15 AND pick_clock_sec <= 259200);