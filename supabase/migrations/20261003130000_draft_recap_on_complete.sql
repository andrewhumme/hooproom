-- Send post-draft recap emails the moment a draft completes.
--
-- Previously recaps only went out when someone signed in opened the summary
-- page after the draft, so an offline draft whose commissioner never opened
-- it (or any draft everyone left right at the end) sent nothing. Now a trigger
-- calls the app as soon as draft_rooms.status becomes 'complete'; the summary
-- page still triggers it too, and recap_sent_at makes sure each draft is only
-- emailed once.

-- Every human team's recap address in one call: the account email (real,
-- non-anonymous accounts), else the email the commissioner entered for that
-- team. Bots and teams without any address are omitted.
CREATE OR REPLACE FUNCTION public.recap_recipients(_room_id uuid)
RETURNS TABLE (participant_id uuid, team_name text, draft_position integer, email text, manager_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  SELECT p.id,
         p.team_name,
         p.draft_position,
         COALESCE(
           CASE WHEN u.is_anonymous IS NOT TRUE THEN NULLIF(u.email, '') END,
           NULLIF(c.owner_email, '')
         ) AS email,
         COALESCE(NULLIF(pr.display_name, ''), NULLIF(u.raw_user_meta_data->>'display_name', ''), p.team_name) AS manager_name
  FROM public.draft_participants p
  LEFT JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  LEFT JOIN public.draft_participant_contacts c ON c.participant_id = p.id
  WHERE p.room_id = _room_id
    AND COALESCE(p.is_bot, false) = false
    AND COALESCE(
          CASE WHEN u.is_anonymous IS NOT TRUE THEN NULLIF(u.email, '') END,
          NULLIF(c.owner_email, '')
        ) IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.recap_recipients(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recap_recipients(uuid) TO service_role;

-- Tell the app a draft just completed. Never blocks completing the draft.
CREATE OR REPLACE FUNCTION public.notify_draft_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://hooproom.app/api/public/hooks/draft-complete',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_YkcF-nUiQWQHGa7fxU21yQ_-WTMRTpj'
      ),
      body := jsonb_build_object('room_id', NEW.id),
      timeout_milliseconds := 30000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_draft_complete failed for room %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS draft_rooms_notify_complete ON public.draft_rooms;
CREATE TRIGGER draft_rooms_notify_complete
  AFTER UPDATE OF status ON public.draft_rooms
  FOR EACH ROW
  WHEN (NEW.status = 'complete' AND OLD.status IS DISTINCT FROM 'complete' AND NEW.recap_sent_at IS NULL)
  EXECUTE FUNCTION public.notify_draft_complete();
