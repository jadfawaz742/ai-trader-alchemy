-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create cron job to validate pending models every 5 minutes
SELECT cron.schedule(
  'validate-pending-models-cron',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://ncetkhcryoxchkodlzgj.supabase.co/functions/v1/validate-pending-models',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZXRraGNyeW94Y2hrb2RsemdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MTY1NjcsImV4cCI6MjA3MjM5MjU2N30.Q4HRfnIyZJajutujbVlQUiU587YUF9haPn3kphi_CBk"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);