-- Let invitees open and join a private room from its link.
--
-- draft_rooms RLS only shows private rooms to the host and participants, so a
-- friend opening the invite link saw "Room not found", and the
-- draft_participants INSERT policy (whose room check runs under that same RLS)
-- rejected their join. The room id in the link acts as the invite: these
-- SECURITY DEFINER functions serve a room's lobby to any signed-in user who
-- has the id, without making private rooms listable or discoverable.

-- Lobby details for a room you've been sent the link to. Returns NULL if the
-- room doesn't exist. Once a draft has started, only its name and status are
-- returned (non-members can't join a running draft).
CREATE OR REPLACE FUNCTION public.get_room_invite(_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _room public.draft_rooms;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF _room.status <> 'waiting' THEN
    RETURN jsonb_build_object(
      'room', jsonb_build_object('id', _room.id, 'name', _room.name, 'status', _room.status)
    );
  END IF;

  RETURN jsonb_build_object(
    -- The private watch link stays with the host and members.
    'room', to_jsonb(_room) - 'watch_token',
    'participants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'room_id', p.room_id,
        'user_id', p.user_id,
        'draft_position', p.draft_position,
        'team_name', p.team_name,
        'joined_at', p.joined_at,
        'updated_at', p.updated_at,
        'is_bot', COALESCE(p.is_bot, false)
      ) ORDER BY p.draft_position NULLS LAST, p.joined_at)
      FROM public.draft_participants p
      WHERE p.room_id = _room.id
    ), '[]'::jsonb)
  );
END;
$function$;

-- Take a seat in a waiting room you have the link to. Idempotent: returns
-- your existing participant id if you're already in.
CREATE OR REPLACE FUNCTION public.join_room(_room_id uuid, _team_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _room public.draft_rooms;
  _id uuid;
  _seated integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in to join this draft'; END IF;

  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

  SELECT id INTO _id FROM public.draft_participants
  WHERE room_id = _room_id AND user_id = _uid;
  IF _id IS NOT NULL THEN RETURN _id; END IF;

  IF _room.status <> 'waiting' THEN
    RAISE EXCEPTION 'This draft has already started';
  END IF;
  IF _room.visibility = 'spectate' AND _room.host_user_id <> _uid THEN
    RAISE EXCEPTION 'This room is spectate-only';
  END IF;

  SELECT count(*) INTO _seated FROM public.draft_participants WHERE room_id = _room_id;
  IF _seated >= _room.team_count THEN
    RAISE EXCEPTION 'This room is full';
  END IF;

  INSERT INTO public.draft_participants (room_id, user_id, team_name)
  VALUES (_room_id, _uid, left(COALESCE(NULLIF(trim(_team_name), ''), 'Team'), 40))
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_room_invite(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_room(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room(uuid, text) TO authenticated;
