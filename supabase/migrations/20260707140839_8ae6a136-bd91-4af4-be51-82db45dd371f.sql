
-- Helper: can current user view a room? SECURITY DEFINER to avoid RLS recursion.
CREATE OR REPLACE FUNCTION public.can_view_room(_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.draft_rooms r
    WHERE r.id = _room_id
      AND (
        r.visibility = ANY (ARRAY['public','spectate'])
        OR r.host_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.draft_participants p
          WHERE p.room_id = r.id AND p.user_id = auth.uid()
        )
      )
  );
$$;

-- draft_rooms
DROP POLICY IF EXISTS "Authed users can view rooms" ON public.draft_rooms;
CREATE POLICY "Authed users can view visible rooms"
  ON public.draft_rooms FOR SELECT TO authenticated
  USING (
    visibility = ANY (ARRAY['public','spectate'])
    OR host_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.draft_participants p
      WHERE p.room_id = draft_rooms.id AND p.user_id = auth.uid()
    )
  );

-- draft_participants
DROP POLICY IF EXISTS "Authed users can view participants" ON public.draft_participants;
CREATE POLICY "Authed users can view participants of visible rooms"
  ON public.draft_participants FOR SELECT TO authenticated
  USING (public.can_view_room(room_id));

-- draft_picks
DROP POLICY IF EXISTS "Authed users can view picks" ON public.draft_picks;
CREATE POLICY "Authed users can view picks of visible rooms"
  ON public.draft_picks FOR SELECT TO authenticated
  USING (public.can_view_room(room_id));

-- draft_pick_assignments
DROP POLICY IF EXISTS "Authed users can view pick assignments" ON public.draft_pick_assignments;
CREATE POLICY "Authed users can view pick assignments of visible rooms"
  ON public.draft_pick_assignments FOR SELECT TO authenticated
  USING (public.can_view_room(room_id));

-- room_keepers
DROP POLICY IF EXISTS "Authed users can view keepers" ON public.room_keepers;
CREATE POLICY "Authed users can view keepers of visible rooms"
  ON public.room_keepers FOR SELECT TO authenticated
  USING (public.can_view_room(room_id));

-- auction_nominations
DROP POLICY IF EXISTS "Authed users can view nominations" ON public.auction_nominations;
CREATE POLICY "Authed users can view nominations of visible rooms"
  ON public.auction_nominations FOR SELECT TO authenticated
  USING (public.can_view_room(room_id));

-- auction_bids
DROP POLICY IF EXISTS "Authed users can view bids" ON public.auction_bids;
CREATE POLICY "Authed users can view bids of visible rooms"
  ON public.auction_bids FOR SELECT TO authenticated
  USING (public.can_view_room(room_id));

-- profiles: restrict to signed-in users only
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);
