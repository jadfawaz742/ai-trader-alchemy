-- Enable RLS on tables that are missing it
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bybit_usage ENABLE ROW LEVEL SECURITY;

-- Add basic RLS policies for api_usage (system-level tracking)
CREATE POLICY "Service role can manage api_usage"
  ON public.api_usage
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Add basic RLS policies for test_table (allow authenticated users)
CREATE POLICY "Authenticated users can view test_table"
  ON public.test_table
  FOR SELECT
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated users can insert test_table"
  ON public.test_table
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated'::text);

-- Add basic RLS policies for bybit_usage (system-level tracking)
CREATE POLICY "Service role can manage bybit_usage"
  ON public.bybit_usage
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);