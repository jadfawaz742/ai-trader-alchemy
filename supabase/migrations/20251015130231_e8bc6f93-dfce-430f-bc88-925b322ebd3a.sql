-- Create backtest_runs table for tracking backtest jobs
CREATE TABLE IF NOT EXISTS public.backtest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  symbols TEXT[] NOT NULL,
  period TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  total_symbols INTEGER NOT NULL,
  completed_symbols INTEGER NOT NULL DEFAULT 0,
  failed_symbols INTEGER NOT NULL DEFAULT 0,
  aggregate_results JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Create backtest_trades table for individual trade records
CREATE TABLE IF NOT EXISTS public.backtest_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_run_id UUID NOT NULL REFERENCES public.backtest_runs(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  action TEXT NOT NULL,
  price NUMERIC NOT NULL,
  quantity NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL,
  indicators JSONB,
  pnl NUMERIC,
  exit_price NUMERIC,
  exit_timestamp TIMESTAMPTZ,
  duration_minutes INTEGER,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create backtest_jobs table for queue processing
CREATE TABLE IF NOT EXISTS public.backtest_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  backtest_run_id UUID NOT NULL REFERENCES public.backtest_runs(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  period TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 100,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  results JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtest_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtest_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for backtest_runs
DROP POLICY IF EXISTS "Users can view their own backtest runs" ON public.backtest_runs;
CREATE POLICY "Users can view their own backtest runs"
  ON public.backtest_runs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own backtest runs" ON public.backtest_runs;
CREATE POLICY "Users can insert their own backtest runs"
  ON public.backtest_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own backtest runs" ON public.backtest_runs;
CREATE POLICY "Users can update their own backtest runs"
  ON public.backtest_runs FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage backtest runs" ON public.backtest_runs;
CREATE POLICY "Service role can manage backtest runs"
  ON public.backtest_runs FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- RLS Policies for backtest_trades
DROP POLICY IF EXISTS "Users can view their own backtest trades" ON public.backtest_trades;
CREATE POLICY "Users can view their own backtest trades"
  ON public.backtest_trades FOR SELECT
  USING (backtest_run_id IN (
    SELECT id FROM public.backtest_runs WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Service role can manage backtest trades" ON public.backtest_trades;
CREATE POLICY "Service role can manage backtest trades"
  ON public.backtest_trades FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- RLS Policies for backtest_jobs
DROP POLICY IF EXISTS "Users can view their own backtest jobs" ON public.backtest_jobs;
CREATE POLICY "Users can view their own backtest jobs"
  ON public.backtest_jobs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage backtest jobs" ON public.backtest_jobs;
CREATE POLICY "Service role can manage backtest jobs"
  ON public.backtest_jobs FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_backtest_runs_user_id ON public.backtest_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_batch_id ON public.backtest_runs(batch_id);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_status ON public.backtest_runs(status);

CREATE INDEX IF NOT EXISTS idx_backtest_trades_run_id ON public.backtest_trades(backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_symbol ON public.backtest_trades(symbol);

CREATE INDEX IF NOT EXISTS idx_backtest_jobs_batch_id ON public.backtest_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_backtest_jobs_status ON public.backtest_jobs(status);
CREATE INDEX IF NOT EXISTS idx_backtest_jobs_priority ON public.backtest_jobs(priority DESC);