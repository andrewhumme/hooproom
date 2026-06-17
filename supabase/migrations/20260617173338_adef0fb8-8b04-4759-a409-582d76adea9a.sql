
ALTER TABLE public.draft_rooms
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public','private'));

CREATE INDEX IF NOT EXISTS idx_draft_rooms_visibility_status
  ON public.draft_rooms(visibility, status);

GRANT SELECT ON public.draft_rooms TO anon;
GRANT SELECT ON public.draft_participants TO anon;

CREATE POLICY "Anon can view public rooms"
  ON public.draft_rooms FOR SELECT TO anon
  USING (visibility = 'public');

CREATE POLICY "Anon can view participants of public rooms"
  ON public.draft_participants FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.draft_rooms r
    WHERE r.id = draft_participants.room_id AND r.visibility = 'public'
  ));
