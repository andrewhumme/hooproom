-- Email a manager when they go on the clock.
--
-- Only for online snake drafts with a pick clock of 10 minutes or more — on a
-- faster clock the pick (or autopick) happens before an email could help.
-- A team picking back-to-back (end of a snake turn, reversal rounds, traded
-- picks) gets one email for the first pick, not one per pick.
--
-- Flow: a draft_rooms trigger fires when the pick advances (or the draft
-- starts) and the new pick belongs to a human team, and calls the app. The app
-- claims the email through claim_on_clock_email(), which re-checks everything
-- and records (room, pick) so each turn is only ever emailed once.

CREATE TABLE IF NOT EXISTS public.on_clock_emails (
  room_id uuid NOT NULL REFERENCES public.draft_rooms(id) ON DELETE CASCADE,
  pick_number integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, pick_number)
);
ALTER TABLE public.on_clock_emails ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role / SECURITY DEFINER functions touch it.

CREATE OR REPLACE FUNCTION public.claim_on_clock_email(_room_id uuid, _pick_number integer)
RETURNS TABLE (
  email text,
  manager_name text,
  team_name text,
  room_name text,
  round integer,
  pick_in_round integer,
  pick_clock_sec integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _room public.draft_rooms;
  _team_idx smallint;
  _participant public.draft_participants;
  _recipient record;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id;
  IF _room IS NULL
     OR _room.status <> 'drafting'
     OR _room.draft_format <> 'snake'
     OR _room.draft_mode <> 'online'
     OR _room.pick_clock_sec < 600
     OR _room.current_pick_number <> _pick_number
     OR _pick_number > _room.team_count * _room.rounds THEN
    RETURN;
  END IF;

  _team_idx := public.pick_team_for(_room, _pick_number);

  -- Same team picked right before this — they're already in the room.
  IF _pick_number > 1 AND public.pick_team_for(_room, _pick_number - 1) = _team_idx THEN
    RETURN;
  END IF;

  SELECT * INTO _participant FROM public.draft_participants
  WHERE room_id = _room_id AND draft_position = _team_idx;
  IF _participant IS NULL OR _participant.user_id IS NULL OR COALESCE(_participant.is_bot, false) THEN
    RETURN;
  END IF;

  SELECT * INTO _recipient FROM public.recap_recipients(_room_id) r
  WHERE r.participant_id = _participant.id;
  IF _recipient IS NULL OR _recipient.email IS NULL THEN RETURN; END IF;

  INSERT INTO public.on_clock_emails (room_id, pick_number)
  VALUES (_room_id, _pick_number)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;

  email := _recipient.email;
  manager_name := _recipient.manager_name;
  team_name := _recipient.team_name;
  room_name := _room.name;
  round := ((_pick_number - 1) / _room.team_count) + 1;
  pick_in_round := ((_pick_number - 1) % _room.team_count) + 1;
  pick_clock_sec := _room.pick_clock_sec;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_on_clock_email(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_on_clock_email(uuid, integer) TO service_role;

-- Tell the app a human team just went on the clock. Never blocks the pick.
CREATE OR REPLACE FUNCTION public.notify_on_clock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF NEW.current_pick_number > NEW.team_count * NEW.rounds THEN RETURN NEW; END IF;
    -- Skip bots and empty seats without a round trip to the app.
    IF NOT EXISTS (
      SELECT 1 FROM public.draft_participants p
      WHERE p.room_id = NEW.id
        AND p.draft_position = public.pick_team_for(NEW, NEW.current_pick_number)
        AND p.user_id IS NOT NULL
        AND NOT COALESCE(p.is_bot, false)
    ) THEN
      RETURN NEW;
    END IF;
    PERFORM net.http_post(
      url := 'https://hooproom.app/api/public/hooks/on-clock',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_YkcF-nUiQWQHGa7fxU21yQ_-WTMRTpj'
      ),
      body := jsonb_build_object('room_id', NEW.id, 'pick_number', NEW.current_pick_number),
      timeout_milliseconds := 30000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_clock failed for room %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS draft_rooms_notify_on_clock ON public.draft_rooms;
CREATE TRIGGER draft_rooms_notify_on_clock
  AFTER UPDATE OF current_pick_number, status ON public.draft_rooms
  FOR EACH ROW
  WHEN (
    NEW.status = 'drafting'
    AND NEW.draft_format = 'snake'
    AND NEW.draft_mode = 'online'
    AND NEW.pick_clock_sec >= 600
    AND (OLD.current_pick_number IS DISTINCT FROM NEW.current_pick_number
         OR OLD.status IS DISTINCT FROM 'drafting')
  )
  EXECUTE FUNCTION public.notify_on_clock();
