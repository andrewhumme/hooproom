-- Emails now go straight to Resend from the app (post-draft summaries) and
-- from the Supabase Auth "Send Email" hook (/api/public/auth-email-hook).
-- The Lovable-era queue dispatcher job is no longer used.
DO $$
BEGIN
  PERFORM cron.unschedule('process-email-queue');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job was never created on this project
END $$;
