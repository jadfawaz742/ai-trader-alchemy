-- Create batch training jobs table to track progress of batch model training
CREATE TABLE public.batch_training_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'training', 'completed', 'failed', 'skipped')),
  priority INTEGER NOT NULL DEFAULT 100,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  training_data_points INTEGER,
  performance_metrics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_batch_training_jobs_user_batch ON public.batch_training_jobs(user_id, batch_id);
CREATE INDEX idx_batch_training_jobs_status ON public.batch_training_jobs(status);
CREATE INDEX idx_batch_training_jobs_priority ON public.batch_training_jobs(priority DESC);

-- Enable RLS
ALTER TABLE public.batch_training_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own training jobs"
  ON public.batch_training_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own training jobs"
  ON public.batch_training_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own training jobs"
  ON public.batch_training_jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all training jobs"
  ON public.batch_training_jobs FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Trigger to update updated_at
CREATE TRIGGER update_batch_training_jobs_updated_at
  BEFORE UPDATE ON public.batch_training_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();