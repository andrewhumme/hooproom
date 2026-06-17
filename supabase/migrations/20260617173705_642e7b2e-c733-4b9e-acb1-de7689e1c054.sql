
ALTER TABLE public.draft_rooms DROP CONSTRAINT IF EXISTS draft_rooms_visibility_check;
ALTER TABLE public.draft_rooms
  ADD CONSTRAINT draft_rooms_visibility_check
  CHECK (visibility IN ('public','spectate','private'));

-- Update anon SELECT policy for participants to allow viewing public OR spectate rooms
DROP POLICY IF EXISTS "Anon can view participants of public rooms" ON public.draft_participants;
CREATE POLICY "Anon can view participants of public rooms"
  ON public.draft_participants FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.draft_rooms r
    WHERE r.id = draft_participants.room_id
      AND r.visibility IN ('public','spectate')
  ));

-- Update anon SELECT policy for rooms to allow listing public OR spectate
DROP POLICY IF EXISTS "Anon can view public rooms" ON public.draft_rooms;
CREATE POLICY "Anon can view listed rooms"
  ON public.draft_rooms FOR SELECT TO anon
  USING (visibility IN ('public','spectate'));

-- Tighten join policy: block joining spectate-only rooms (host can still create their own initial seat)
DROP POLICY IF EXISTS "Authed users can join waiting rooms" ON public.draft_participants;
CREATE POLICY "Authed users can join waiting rooms"
  ON public.draft_participants FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.draft_rooms r
      WHERE r.id = draft_participants.room_id
        AND r.status = 'waiting'
        AND (r.visibility <> 'spectate' OR r.host_user_id = auth.uid())
    )
  );
