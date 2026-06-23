-- Nightly cleanup of stale guest accounts.
-- A "guest" is an auto-created throwaway login: email matches guest_*@hooproom.test
-- Delete when not seen for 7 days AND not currently sitting in an active draft room.

CREATE OR REPLACE FUNCTION public.delete_stale_guests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _deleted int := 0;
BEGIN
  WITH stale AS (
    SELECT u.id
    FROM auth.users u
    WHERE u.email ~* '^guest_[a-z0-9]+@hooproom\.test$'
      AND COALESCE(u.last_sign_in_at, u.created_at) < now() - interval '7 days'
      AND NOT EXISTS (
        SELECT 1
        FROM public.draft_participants p
        JOIN public.draft_rooms r ON r.id = p.room_id
        WHERE p.user_id = u.id
          AND r.status IN ('waiting', 'drafting', 'paused')
      )
  ),
  del AS (
    DELETE FROM auth.users WHERE id IN (SELECT id FROM stale) RETURNING 1
  )
  SELECT count(*) INTO _deleted FROM del;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_stale_guests() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Replace any prior schedule with the same name
DO $$
BEGIN
  PERFORM cron.unschedule('delete-stale-guests-nightly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'delete-stale-guests-nightly',
  '15 9 * * *', -- daily at 09:15 UTC
  $$ SELECT public.delete_stale_guests(); $$
);