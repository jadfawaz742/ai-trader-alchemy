-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop existing cron job if it exists
SELECT cron.unschedule('process-training-queue') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-training-queue'
);

-- Create cron job to process training queue every minute
SELECT cron.schedule(
  'process-training-queue',
  '* * * * *',  -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://ncetkhcryoxchkodlzgj.supabase.co/functions/v1/process-training-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);