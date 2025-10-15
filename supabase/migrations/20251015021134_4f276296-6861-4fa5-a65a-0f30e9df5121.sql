-- Create training_anomalies table to log invalid actions during training

CREATE TABLE IF NOT EXISTS public.training_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_id UUID REFERENCES public.asset_models(id) ON DELETE CASCADE,
  episode_num INTEGER NOT NULL,
  bar_index INTEGER NOT NULL,
  anomaly_type TEXT NOT NULL,
  details JSONB NOT NULL,
  auto_corrected BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT training_anomalies_type_check CHECK (
    anomaly_type IN ('tpsl_invalid', 'risk_breach', 'action_masked', 'cooldown_mask', 'position_size_adjusted')
  )
);

-- Create index for efficient querying by model
CREATE INDEX IF NOT EXISTS idx_training_anomalies_model_id ON public.training_anomalies(model_id);

-- Create index for querying by episode
CREATE INDEX IF NOT EXISTS idx_training_anomalies_episode ON public.training_anomalies(model_id, episode_num);

-- Create index for anomaly type analysis
CREATE INDEX IF NOT EXISTS idx_training_anomalies_type ON public.training_anomalies(anomaly_type);

-- Enable RLS
ALTER TABLE public.training_anomalies ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own training anomalies"
  ON public.training_anomalies
  FOR SELECT
  USING (
    model_id IN (
      SELECT id FROM public.asset_models WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert training anomalies"
  ON public.training_anomalies
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update training anomalies"
  ON public.training_anomalies
  FOR UPDATE
  USING (true);

-- Add comment
COMMENT ON TABLE public.training_anomalies IS 'Tracks invalid actions and auto-corrections during PPO training';
COMMENT ON COLUMN public.training_anomalies.anomaly_type IS 'Type of anomaly: tpsl_invalid, risk_breach, action_masked, cooldown_mask, position_size_adjusted';
COMMENT ON COLUMN public.training_anomalies.auto_corrected IS 'Whether the anomaly was automatically corrected by the system';