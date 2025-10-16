-- Setup automated training queue processing with pg_cron

-- Enable required extensions for CRON scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the training queue processor to run every 2 minutes
-- This will automatically process up to 5 training jobs from the queue
SELECT cron.schedule(
  'process-training-queue',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT
    net.http_post(
        url:='https://ncetkhcryoxchkodlzgj.supabase.co/functions/v1/process-training-queue',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZXRraGNyeW94Y2hrb2RsemdqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjgxNjU2NywiZXhwIjoyMDcyMzkyNTY3fQ.SW18WL459HN6SJYGFb8j5LzBaYWK7liqhBNn"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Add comment explaining the CRON job
COMMENT ON EXTENSION pg_cron IS 'Automated training queue processing every 2 minutes (5 jobs per batch = ~150 jobs/hour)';

-- Verify the CRON job was created
SELECT 
  jobid,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'process-training-queue';