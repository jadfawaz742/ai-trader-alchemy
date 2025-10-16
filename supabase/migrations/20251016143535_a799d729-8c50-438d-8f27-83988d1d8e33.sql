-- Setup automated training queue processing
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule queue processor to run every 2 minutes
SELECT cron.schedule(
  'process-training-queue',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT
    net.http_post(
        url:='https://ncetkhcryoxchkodlzgj.supabase.co/functions/v1/process-training-queue',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZXRraGNyeW94Y2hrb2RsemdqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjgxNjU2NywiZXhwIjoyMDcyMzkyNTY3fQ.SW18WL459HN6SJYGFb8j5LzBaYWK7liqhBNn"}'::jsonb,
        body:='{"source": "cron"}'::jsonb
    ) as request_id;
  $$
);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'process-training-queue';