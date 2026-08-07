CREATE TABLE public.draft_participant_contacts (
  participant_id uuid PRIMARY KEY REFERENCES public.draft_participants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.draft_rooms(id) ON DELETE CASCADE,
  owner_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.draft_participant_contacts TO authenticated;
GRANT ALL ON public.draft_participant_contacts TO service_role;

ALTER TABLE public.draft_participant_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Host can view participant contacts"
ON public.draft_participant_contacts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.draft_rooms r WHERE r.id = room_id AND r.host_user_id = auth.uid()));

CREATE POLICY "Host can insert participant contacts"
ON public.draft_participant_contacts FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.draft_rooms r WHERE r.id = room_id AND r.host_user_id = auth.uid()));

CREATE POLICY "Host can update participant contacts"
ON public.draft_participant_contacts FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.draft_rooms r WHERE r.id = room_id AND r.host_user_id = auth.uid()));

CREATE POLICY "Host can delete participant contacts"
ON public.draft_participant_contacts FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.draft_rooms r WHERE r.id = room_id AND r.host_user_id = auth.uid()));

CREATE TRIGGER draft_participant_contacts_updated_at
BEFORE UPDATE ON public.draft_participant_contacts
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.draft_participant_contacts (participant_id, room_id, owner_email)
SELECT id, room_id, owner_email FROM public.draft_participants WHERE owner_email IS NOT NULL
ON CONFLICT (participant_id) DO NOTHING;

ALTER TABLE public.draft_participants DROP COLUMN owner_email;

CREATE OR REPLACE FUNCTION public.host_room_owner_emails(_room_id uuid)
RETURNS TABLE(participant_id uuid, owner_email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.participant_id, c.owner_email
  FROM public.draft_participant_contacts c
  JOIN public.draft_rooms r ON r.id = c.room_id
  WHERE c.room_id = _room_id AND r.host_user_id = auth.uid();
$$;