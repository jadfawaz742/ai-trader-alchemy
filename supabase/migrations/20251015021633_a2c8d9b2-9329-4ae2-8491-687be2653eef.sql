-- Create model_validations table to store aggregate validation results
CREATE TABLE IF NOT EXISTS public.model_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_id UUID REFERENCES public.asset_models(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  
  -- Configuration
  train_months INTEGER NOT NULL,
  test_months INTEGER NOT NULL,
  
  -- Aggregate metrics
  total_windows INTEGER NOT NULL,
  passed_windows INTEGER NOT NULL,
  failed_windows INTEGER NOT NULL,
  
  avg_test_win_rate NUMERIC(5,4),
  avg_test_sharpe NUMERIC(6,3),
  avg_test_drawdown NUMERIC(5,4),
  total_test_pnl NUMERIC(12,2),
  
  -- Consistency
  win_rate_std_dev NUMERIC(5,4),
  sharpe_std_dev NUMERIC(6,3),
  
  -- Verdict
  approved BOOLEAN NOT NULL DEFAULT false,
  recommendation TEXT,
  
  -- Full report JSON
  full_report JSONB NOT NULL,
  
  CONSTRAINT model_validations_asset_check CHECK (char_length(asset) > 0)
);

CREATE INDEX IF NOT EXISTS idx_model_validations_model_id ON public.model_validations(model_id);
CREATE INDEX IF NOT EXISTS idx_model_validations_asset ON public.model_validations(asset);
CREATE INDEX IF NOT EXISTS idx_model_validations_approved ON public.model_validations(approved);

-- Create validation_window_details table to store per-window metrics
CREATE TABLE IF NOT EXISTS public.validation_window_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id UUID REFERENCES public.model_validations(id) ON DELETE CASCADE,
  window_number INTEGER NOT NULL,
  
  -- Window definition
  train_start_bar INTEGER NOT NULL,
  train_end_bar INTEGER NOT NULL,
  test_start_bar INTEGER NOT NULL,
  test_end_bar INTEGER NOT NULL,
  window_label TEXT NOT NULL,
  
  -- Train metrics
  train_trades INTEGER,
  train_win_rate NUMERIC(5,4),
  train_sharpe NUMERIC(6,3),
  train_max_drawdown NUMERIC(5,4),
  
  -- Test metrics
  test_trades INTEGER,
  test_win_rate NUMERIC(5,4),
  test_sharpe NUMERIC(6,3),
  test_max_drawdown NUMERIC(5,4),
  test_pnl NUMERIC(12,2),
  
  -- Status
  passed BOOLEAN NOT NULL,
  failure_reasons TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_validation_window_details_validation_id 
  ON public.validation_window_details(validation_id);

-- Enable RLS
ALTER TABLE public.model_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_window_details ENABLE ROW LEVEL SECURITY;

-- RLS policies for model_validations
CREATE POLICY "Users can view validations for their models"
  ON public.model_validations
  FOR SELECT
  USING (
    model_id IN (
      SELECT id FROM public.asset_models WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage model validations"
  ON public.model_validations
  FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role');

-- RLS policies for validation_window_details
CREATE POLICY "Users can view window details for their validations"
  ON public.validation_window_details
  FOR SELECT
  USING (
    validation_id IN (
      SELECT id FROM public.model_validations WHERE model_id IN (
        SELECT id FROM public.asset_models WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Service role can manage validation window details"
  ON public.validation_window_details
  FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role');

-- Add comments
COMMENT ON TABLE public.model_validations IS 'Stores walk-forward validation results for trained models';
COMMENT ON TABLE public.validation_window_details IS 'Stores per-window train/test metrics for walk-forward validation';
COMMENT ON COLUMN public.model_validations.approved IS 'Whether the model passed all validation thresholds';
COMMENT ON COLUMN public.validation_window_details.passed IS 'Whether this specific window passed validation thresholds';