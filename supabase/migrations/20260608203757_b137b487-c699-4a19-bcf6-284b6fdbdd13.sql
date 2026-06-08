DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snake-autopick-tick') THEN
    PERFORM cron.unschedule('snake-autopick-tick');
  END IF;
END $$;

SELECT cron.schedule(
  'snake-autopick-tick',
  '10 seconds',
  $cron$
  SELECT net.http_post(
    url := 'https://project--46312d31-45d5-4004-ad9d-f467b5bea016.lovable.app/api/public/snake-tick',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhbXdjY2xoeWJtcmF2aHp1bW55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzMyNTUsImV4cCI6MjA5MjcwOTI1NX0.IpTX0Q3qaxXcd2AbTeyr7Y8ONeauCoZz-q-jZxfb3CQ"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);