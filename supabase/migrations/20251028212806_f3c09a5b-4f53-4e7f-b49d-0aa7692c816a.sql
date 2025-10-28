-- Drop the faulty cron job
SELECT cron.unschedule('live-trading-orchestrator-cycle');

-- Create properly configured cron job (no auth needed since function is public)
SELECT cron.schedule(
  'live-trading-orchestrator-cycle',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ncetkhcryoxchkodlzgj.supabase.co/functions/v1/live-trading-orchestrator',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);