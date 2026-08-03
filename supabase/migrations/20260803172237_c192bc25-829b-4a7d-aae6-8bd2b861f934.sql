-- 1) Hide draft_participants.owner_email from clients via column-level privileges
REVOKE SELECT ON public.draft_participants FROM anon, authenticated;

GRANT SELECT (id, room_id, user_id, draft_position, team_name, joined_at, updated_at, is_bot, share_token)
  ON public.draft_participants TO anon, authenticated;

GRANT ALL ON public.draft_participants TO service_role;

-- Host-only accessor for owner emails
CREATE OR REPLACE FUNCTION public.host_room_owner_emails(_room_id uuid)
RETURNS TABLE(participant_id uuid, owner_email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.draft_rooms r
    WHERE r.id = _room_id AND r.host_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the host can view owner emails';
  END IF;

  RETURN QUERY
  SELECT p.id, p.owner_email
  FROM public.draft_participants p
  WHERE p.room_id = _room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.host_room_owner_emails(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_room_owner_emails(uuid) TO authenticated;

-- 2) Scope profile visibility to self or people sharing a room
CREATE OR REPLACE FUNCTION public.shares_room_with(_other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.draft_participants me
    JOIN public.draft_participants them ON them.room_id = me.room_id
    WHERE me.user_id = auth.uid()
      AND them.user_id = _other_user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.draft_rooms r
    WHERE r.host_user_id = _other_user_id
      AND (
        r.host_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.draft_participants p
          WHERE p.room_id = r.id AND p.user_id = auth.uid()
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.shares_room_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_room_with(uuid) TO authenticated;

DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can view profiles of people in shared rooms"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.shares_room_with(id) OR public.has_role(auth.uid(), 'admin'));