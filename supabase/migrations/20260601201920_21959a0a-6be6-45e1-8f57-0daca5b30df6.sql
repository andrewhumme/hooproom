-- Pre-assign draft positions in the lobby so leagues can set their order before tip-off.

-- 1) Trigger: when someone joins, give them the lowest open draft_position for the room.
CREATE OR REPLACE FUNCTION public.assign_draft_position_on_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _team_count smallint;
  _next int;
BEGIN
  IF NEW.draft_position IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT team_count INTO _team_count FROM public.draft_rooms WHERE id = NEW.room_id;
  IF _team_count IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.pos INTO _next
  FROM generate_series(1, _team_count) AS s(pos)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.draft_participants p
    WHERE p.room_id = NEW.room_id AND p.draft_position = s.pos
  )
  ORDER BY s.pos
  LIMIT 1;

  NEW.draft_position := _next; -- may remain NULL if room is somehow over-full
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_draft_position ON public.draft_participants;
CREATE TRIGGER trg_assign_draft_position
BEFORE INSERT ON public.draft_participants
FOR EACH ROW EXECUTE FUNCTION public.assign_draft_position_on_join();

-- 2) Backfill any waiting-room participants currently missing a position.
WITH ordered AS (
  SELECT p.id,
         p.room_id,
         row_number() OVER (PARTITION BY p.room_id ORDER BY p.joined_at) AS rn,
         (SELECT array_agg(s.pos ORDER BY s.pos)
            FROM generate_series(1, r.team_count) s(pos)
           WHERE NOT EXISTS (
             SELECT 1 FROM public.draft_participants pp
             WHERE pp.room_id = p.room_id
               AND pp.draft_position = s.pos
           )) AS open_slots
  FROM public.draft_participants p
  JOIN public.draft_rooms r ON r.id = p.room_id
  WHERE p.draft_position IS NULL
    AND r.status = 'waiting'
)
UPDATE public.draft_participants p
SET draft_position = o.open_slots[o.rn]
FROM ordered o
WHERE p.id = o.id AND o.open_slots IS NOT NULL AND array_length(o.open_slots,1) >= o.rn;

-- 3) Update auto_fill_and_start so existing pre-assigned positions are preserved,
--    and only seats without a position get filled in (bots and any stragglers).
CREATE OR REPLACE FUNCTION public.auto_fill_and_start(_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _participant_count int;
  _bot_count int;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.status <> 'waiting' THEN RETURN; END IF;

  SELECT count(*) INTO _participant_count FROM public.draft_participants WHERE room_id = _room_id;
  IF _participant_count = 0 THEN RETURN; END IF;

  SELECT count(*) INTO _bot_count FROM public.draft_participants
    WHERE room_id = _room_id AND is_bot = true;

  -- Add bots into the lowest open slots (trigger handles position assignment).
  WHILE _participant_count < _room.team_count LOOP
    _bot_count := _bot_count + 1;
    INSERT INTO public.draft_participants(room_id, user_id, team_name, is_bot)
    VALUES (_room_id, gen_random_uuid(), 'Bot ' || _bot_count, true);
    _participant_count := _participant_count + 1;
  END LOOP;

  -- Fill any remaining NULL positions randomly across leftover open slots.
  WITH missing AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS rn
    FROM public.draft_participants
    WHERE room_id = _room_id AND draft_position IS NULL
  ),
  open_slots AS (
    SELECT s.pos, row_number() OVER (ORDER BY random()) AS rn
    FROM generate_series(1, _room.team_count) s(pos)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.draft_participants p
      WHERE p.room_id = _room_id AND p.draft_position = s.pos
    )
  )
  UPDATE public.draft_participants p
  SET draft_position = o.pos
  FROM missing m JOIN open_slots o ON o.rn = m.rn
  WHERE p.id = m.id;

  -- Insert any keepers into the draft board if helper exists.
  BEGIN
    PERFORM public.insert_room_keepers(_room_id);
  EXCEPTION WHEN undefined_function THEN
    -- ok, keepers helper not present
    NULL;
  END;

  IF _room.draft_format IN ('auction','auction_slow') THEN
    UPDATE public.draft_rooms
    SET status = 'drafting',
        current_pick_number = 1,
        pick_deadline = NULL,
        started_at = now(),
        auto_start_at = NULL
    WHERE id = _room_id;
  ELSE
    UPDATE public.draft_rooms
    SET status = 'drafting',
        current_pick_number = 1,
        pick_deadline = now() + (_room.pick_clock_sec || ' seconds')::interval,
        started_at = now(),
        auto_start_at = NULL
    WHERE id = _room_id;

    BEGIN
      PERFORM public.advance_past_keepers(_room_id);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END IF;
END;
$$;

-- 4) RPC: anyone can claim an OPEN draft position for themselves (or host can move anyone).
CREATE OR REPLACE FUNCTION public.claim_draft_position(_participant_id uuid, _new_position smallint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p public.draft_participants;
  _room public.draft_rooms;
  _existing public.draft_participants;
  _is_host boolean;
BEGIN
  SELECT * INTO _p FROM public.draft_participants WHERE id = _participant_id;
  IF _p IS NULL THEN RAISE EXCEPTION 'Participant not found'; END IF;

  SELECT * INTO _room FROM public.draft_rooms WHERE id = _p.room_id;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.status <> 'waiting' THEN RAISE EXCEPTION 'Draft already started'; END IF;

  _is_host := (_room.host_user_id = auth.uid());
  IF NOT _is_host AND _p.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only move your own seat';
  END IF;

  IF _new_position < 1 OR _new_position > _room.team_count THEN
    RAISE EXCEPTION 'Invalid draft position';
  END IF;

  SELECT * INTO _existing
  FROM public.draft_participants
  WHERE room_id = _p.room_id AND draft_position = _new_position AND id <> _p.id;

  IF _existing.id IS NOT NULL THEN
    IF NOT _is_host THEN
      RAISE EXCEPTION 'That seat is taken — ask the host to swap.';
    END IF;
    -- swap: park other seat to NULL, move me, then put them where I was
    UPDATE public.draft_participants SET draft_position = NULL WHERE id = _existing.id;
    UPDATE public.draft_participants SET draft_position = _new_position WHERE id = _p.id;
    UPDATE public.draft_participants SET draft_position = _p.draft_position WHERE id = _existing.id;
  ELSE
    UPDATE public.draft_participants SET draft_position = _new_position WHERE id = _p.id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_draft_position(uuid, smallint) TO authenticated;

-- 5) RPC: host re-randomizes every participant's draft position.
CREATE OR REPLACE FUNCTION public.host_randomize_positions(_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _room public.draft_rooms;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the host can reorder'; END IF;
  IF _room.status <> 'waiting' THEN RAISE EXCEPTION 'Draft already started'; END IF;

  -- Park everyone to NULL first (unique constraint friendly), then re-assign.
  UPDATE public.draft_participants SET draft_position = NULL WHERE room_id = _room_id;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS pos
    FROM public.draft_participants WHERE room_id = _room_id
  )
  UPDATE public.draft_participants p
  SET draft_position = o.pos
  FROM ordered o WHERE p.id = o.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.host_randomize_positions(uuid) TO authenticated;