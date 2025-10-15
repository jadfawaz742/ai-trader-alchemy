-- Phase 3: Update database schema for enhanced comprehensive PPO metrics (Fixed)

-- Add comprehensive columns to asset_models (IF NOT EXISTS so safe to rerun)
ALTER TABLE asset_models 
  ADD COLUMN IF NOT EXISTS action_space jsonb DEFAULT '{"direction": 3, "tp_offset": [-0.5, 0.5], "sl_tight": [0.5, 2.0], "size": [0.0, 1.0]}'::jsonb,
  ADD COLUMN IF NOT EXISTS structural_features jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hidden_size integer DEFAULT 128,
  ADD COLUMN IF NOT EXISTS sequence_length integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS curriculum_stage text DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS training_data_points integer,
  ADD COLUMN IF NOT EXISTS fine_tuning_metadata jsonb;

-- Add enhanced metrics columns to model_evaluation_metrics
ALTER TABLE model_evaluation_metrics
  ADD COLUMN IF NOT EXISTS long_win_rate numeric,
  ADD COLUMN IF NOT EXISTS short_win_rate numeric,
  ADD COLUMN IF NOT EXISTS long_payoff_ratio numeric,
  ADD COLUMN IF NOT EXISTS short_payoff_ratio numeric,
  ADD COLUMN IF NOT EXISTS fib_alignment_ratio numeric,
  ADD COLUMN IF NOT EXISTS avg_confluence_score numeric,
  ADD COLUMN IF NOT EXISTS avg_tp_distance_atr numeric,
  ADD COLUMN IF NOT EXISTS avg_sl_distance_atr numeric;

-- Create training episodes table if it doesn't exist
CREATE TABLE IF NOT EXISTS training_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES asset_models(id) ON DELETE CASCADE,
  episode_num integer NOT NULL,
  total_reward numeric NOT NULL,
  pnl numeric NOT NULL,
  num_trades integer NOT NULL,
  long_trades integer DEFAULT 0,
  short_trades integer DEFAULT 0,
  long_wins integer DEFAULT 0,
  short_wins integer DEFAULT 0,
  confluence_avg numeric DEFAULT 0,
  fib_alignment_avg numeric DEFAULT 0,
  max_drawdown numeric DEFAULT 0,
  sharpe_ratio numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Drop existing policies if they exist, then create them
DO $$ 
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can view their training episodes" ON training_episodes;
  DROP POLICY IF EXISTS "Service role can manage training episodes" ON training_episodes;
  
  -- Enable RLS
  ALTER TABLE training_episodes ENABLE ROW LEVEL SECURITY;
  
  -- Create policies
  CREATE POLICY "Users can view their training episodes"
    ON training_episodes FOR SELECT
    USING (model_id IN (SELECT id FROM asset_models WHERE user_id = auth.uid()));

  CREATE POLICY "Service role can manage training episodes"
    ON training_episodes FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
END $$;

-- Add indexes for performance (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_training_episodes_model_id ON training_episodes(model_id);
CREATE INDEX IF NOT EXISTS idx_asset_models_curriculum_stage ON asset_models(curriculum_stage);
CREATE INDEX IF NOT EXISTS idx_asset_models_training_data_points ON asset_models(training_data_points);

-- Add curriculum_stage and use_augmentation to batch_training_jobs for adaptive training
ALTER TABLE batch_training_jobs
  ADD COLUMN IF NOT EXISTS curriculum_stage text DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS use_augmentation boolean DEFAULT false;