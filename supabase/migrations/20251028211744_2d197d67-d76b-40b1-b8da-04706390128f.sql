-- Enable global trading flag
INSERT INTO feature_flags (key, enabled, description)
VALUES ('trading_enabled_global', true, 'Master switch for all trading operations')
ON CONFLICT (key) DO UPDATE SET enabled = true;

-- Set up automated trading orchestrator cron job (runs every 5 minutes)
SELECT cron.schedule(
  'live-trading-orchestrator-cycle',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ncetkhcryoxchkodlzgj.supabase.co/functions/v1/live-trading-orchestrator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);