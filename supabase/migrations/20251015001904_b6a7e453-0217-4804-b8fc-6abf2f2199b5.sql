-- Phase 3: Rate Limiting Implementation

-- Create rate_limit_log table
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  user_id uuid,
  ip_address text NOT NULL,
  request_count integer DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_user_endpoint 
  ON public.rate_limit_log(user_id, endpoint, window_start DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limit_ip_endpoint 
  ON public.rate_limit_log(ip_address, endpoint, window_start DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window_cleanup
  ON public.rate_limit_log(window_start);

-- Enable RLS
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access rate limit logs
CREATE POLICY "Service role can manage rate limits"
  ON public.rate_limit_log
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Function to cleanup old rate limit logs (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_log
  WHERE window_start < now() - interval '1 hour';
END;
$$;