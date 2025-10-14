-- Unschedule the existing cron job with placeholder key
SELECT cron.unschedule('process-training-queue');

-- Create the cron job to process training queue every 15 seconds
-- Note: Replace YOUR_SERVICE_ROLE_KEY_HERE with your actual service_role key from:
-- https://supabase.com/dashboard/project/ncetkhcryoxchkodlzgj/settings/api
SELECT cron.schedule(
  'process-training-queue',
  '*/15 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ncetkhcryoxchkodlzgj.supabase.co/functions/v1/process-training-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY_HERE"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);