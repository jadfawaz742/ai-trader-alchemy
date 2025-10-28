-- Drop the faulty cron job
SELECT cron.unschedule('live-trading-orchestrator-cycle');

-- Create fixed cron job that uses vault secret
SELECT cron.schedule(
  'live-trading-orchestrator-cycle',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ncetkhcryoxchkodlzgj.supabase.co/functions/v1/live-trading-orchestrator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('request.jwt.claim.sub', true)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);