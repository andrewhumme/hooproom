-- Advanced stats (TS%, USG%, AST%, TOV%) now come from nbaapi.com instead of
-- stats.nba.com (which stalls server requests). They refresh in their own daily
-- call so each Worker request stays within its subrequest budget; the existing
-- 'refresh-season-stats' job (10:15 UTC) keeps loading per-game stats.
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-advanced-stats');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'refresh-advanced-stats',
  '30 10 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://hooproom.app/api/public/hooks/refresh-season-stats?part=advanced',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_YkcF-nUiQWQHGa7fxU21yQ_-WTMRTpj'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
