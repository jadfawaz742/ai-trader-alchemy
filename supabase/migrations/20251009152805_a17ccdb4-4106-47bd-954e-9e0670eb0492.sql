-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Enable pg_net extension for HTTP requests from cron
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to trigger online PPO updates for all active assets
CREATE OR REPLACE FUNCTION public.trigger_online_ppo_updates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  asset_record RECORD;
BEGIN
  FOR asset_record IN 
    SELECT DISTINCT asset 
    FROM public.models 
    WHERE status = 'active'
  LOOP
    PERFORM net.http_post(
      url := 'https://ncetkhcryoxchkodlzgj.supabase.co/functions/v1/online-ppo-update',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := json_build_object('asset', asset_record.asset)::jsonb
    );
  END LOOP;
END;
$$;

-- Schedule generate-signals to run every minute (configurable)
SELECT cron.schedule(
  'generate-signals-job',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ncetkhcryoxchkodlzgj.supabase.co/functions/v1/generate-signals',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"scheduled": true}'::jsonb
  );
  $$
);

-- Schedule online-ppo-update to run every 15 minutes for each asset
SELECT cron.schedule(
  'online-ppo-update-job',
  '*/15 * * * *',
  $$SELECT public.trigger_online_ppo_updates();$$
);

-- Schedule safety-monitor to run every 5 minutes
SELECT cron.schedule(
  'safety-monitor-job',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ncetkhcryoxchkodlzgj.supabase.co/functions/v1/safety-monitor',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"scheduled": true}'::jsonb
  );
  $$
);

-- Create table to track cron job execution history
CREATE TABLE IF NOT EXISTS public.cron_job_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  details JSONB,
  error_message TEXT
);

ALTER TABLE public.cron_job_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view cron history"
  ON public.cron_job_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Create index for job history queries
CREATE INDEX IF NOT EXISTS idx_cron_job_history_job_name ON public.cron_job_history(job_name);
CREATE INDEX IF NOT EXISTS idx_cron_job_history_started_at ON public.cron_job_history(started_at DESC);