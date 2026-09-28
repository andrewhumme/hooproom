-- Remove scheduled jobs that still call the deleted Lovable project
-- (e.g. 'lobby-autostart-tick' → https://project--…lovable.app/api/public/lobby-tick).
-- Their work already runs in-database via 'snake-autopick-tick-direct' and
-- 'auction-tick-direct' (which also calls lobby_autostart_due()).
DO $$
DECLARE
  _job record;
BEGIN
  FOR _job IN
    SELECT jobid, jobname FROM cron.job WHERE command ILIKE '%lovable.app%'
  LOOP
    PERFORM cron.unschedule(_job.jobid);
    RAISE NOTICE 'Unscheduled cron job % (%)', _job.jobname, _job.jobid;
  END LOOP;
END $$;
