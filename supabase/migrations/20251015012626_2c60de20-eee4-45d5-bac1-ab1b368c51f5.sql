-- Fix the process-training-queue cron job to work with public function
-- Drop the existing cron job that was failing due to auth issues
SELECT cron.unschedule('process-training-queue') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-training-queue'
);

-- Create new cron job without Authorization header (function is now public)
SELECT cron.schedule(
  'process-training-queue',
  '* * * * *',  -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://ncetkhcryoxchkodlzgj.supabase.co/functions/v1/process-training-queue',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  ) as request_id;
  $$
);