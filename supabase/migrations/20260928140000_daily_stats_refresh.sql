-- Refresh current-season stats every day (what HoopRank, bots and autopick
-- rank on). The Lovable-era weekly job called the old lovable.app address and
-- no longer runs, so player_season_stats stopped updating.
--
-- 10:15 UTC ≈ early morning US time, after the previous night's games.
-- The endpoint checks the (public) publishable key in the apikey header.
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-season-stats');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'refresh-season-stats',
  '15 10 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://hooproom.app/api/public/hooks/refresh-season-stats',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_YkcF-nUiQWQHGa7fxU21yQ_-WTMRTpj'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
