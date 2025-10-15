-- Phase 1: Database Schema Updates for Recurrent PPO with Structural Features

-- 1.1 Extend asset_models table
ALTER TABLE asset_models 
ADD COLUMN IF NOT EXISTS model_architecture TEXT DEFAULT 'recurrent_ppo',
ADD COLUMN IF NOT EXISTS sequence_length INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS hidden_size INTEGER DEFAULT 128,
ADD COLUMN IF NOT EXISTS structural_features JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS action_space JSONB DEFAULT '{"direction": 3, "tp_offset": [-0.5, 0.5], "sl_tight": [0.5, 2.0], "size": [0.0, 1.0]}'::jsonb;

-- 1.2 Create structural_features_cache table
CREATE TABLE IF NOT EXISTS structural_features_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  atr NUMERIC NOT NULL,
  regime_acc NUMERIC DEFAULT 0,
  regime_adv NUMERIC DEFAULT 0,
  regime_dist NUMERIC DEFAULT 0,
  regime_decl NUMERIC DEFAULT 0,
  vol_regime INTEGER DEFAULT 1,
  dist_to_support NUMERIC,
  dist_to_resistance NUMERIC,
  sr_strength NUMERIC,
  fib_127_up NUMERIC,
  fib_161_up NUMERIC,
  fib_127_dn NUMERIC,
  fib_161_dn NUMERIC,
  fib_38_retrace NUMERIC,
  fib_61_retrace NUMERIC,
  last_swing_high NUMERIC,
  last_swing_low NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(asset, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_structural_cache_asset_ts ON structural_features_cache(asset, timestamp DESC);

-- 1.3 Create training_episodes table
CREATE TABLE IF NOT EXISTS training_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES asset_models(id) ON DELETE CASCADE,
  episode_num INTEGER NOT NULL,
  total_reward NUMERIC,
  pnl NUMERIC,
  num_trades INTEGER DEFAULT 0,
  long_trades INTEGER DEFAULT 0,
  short_trades INTEGER DEFAULT 0,
  long_wins INTEGER DEFAULT 0,
  short_wins INTEGER DEFAULT 0,
  confluence_avg NUMERIC,
  fib_alignment_avg NUMERIC,
  max_drawdown NUMERIC,
  sharpe_ratio NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_episodes_model ON training_episodes(model_id, episode_num DESC);

-- 1.4 Extend signals table for new TP/SL parameters
ALTER TABLE signals
ADD COLUMN IF NOT EXISTS tp_offset NUMERIC,
ADD COLUMN IF NOT EXISTS sl_tight NUMERIC,
ADD COLUMN IF NOT EXISTS confluence_score NUMERIC,
ADD COLUMN IF NOT EXISTS fib_alignment NUMERIC,
ADD COLUMN IF NOT EXISTS structural_features JSONB;

-- 1.5 Create model_evaluation_metrics table
CREATE TABLE IF NOT EXISTS model_evaluation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES asset_models(id) ON DELETE CASCADE,
  evaluation_type TEXT NOT NULL, -- 'walk_forward', 'stress_2x_costs', 'regime_specific'
  mar NUMERIC,
  max_drawdown NUMERIC,
  sharpe_ratio NUMERIC,
  sortino_ratio NUMERIC,
  long_payoff_ratio NUMERIC,
  short_payoff_ratio NUMERIC,
  fib_alignment_ratio NUMERIC,
  avg_confluence_score NUMERIC,
  total_trades INTEGER,
  win_rate NUMERIC,
  passed_acceptance BOOLEAN DEFAULT false,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_eval_model ON model_evaluation_metrics(model_id, created_at DESC);