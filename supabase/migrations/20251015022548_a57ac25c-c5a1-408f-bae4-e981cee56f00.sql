-- Phase 4: Live Trading Integration Schema

-- Add paper trading mode flag to user_asset_prefs
ALTER TABLE user_asset_prefs ADD COLUMN IF NOT EXISTS paper_trading_enabled BOOLEAN DEFAULT true;

-- Create paper_trades table for simulated trading
CREATE TABLE IF NOT EXISTS paper_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  asset TEXT NOT NULL,
  signal_id UUID REFERENCES signals(id),
  
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  qty NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  sl NUMERIC,
  tp NUMERIC,
  exit_price NUMERIC,
  exit_reason TEXT CHECK (exit_reason IN ('TP_HIT', 'SL_HIT', 'MANUAL_CLOSE', 'TIMEOUT')),
  
  pnl NUMERIC,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  
  CONSTRAINT paper_trades_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create trading_alerts table for monitoring
CREATE TABLE IF NOT EXISTS trading_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  asset TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('DRAWDOWN', 'LOSING_STREAK', 'RISK_BREACH', 'MODEL_DEGRADATION')),
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  message TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT trading_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create orchestrator_metrics table for tracking orchestrator performance
CREATE TABLE IF NOT EXISTS orchestrator_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_timestamp TIMESTAMPTZ NOT NULL,
  users_processed INTEGER NOT NULL,
  signals_generated INTEGER NOT NULL,
  signals_executed INTEGER NOT NULL,
  signals_blocked INTEGER NOT NULL,
  avg_latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_paper_trades_user_status ON paper_trades(user_id, status);
CREATE INDEX IF NOT EXISTS idx_paper_trades_asset ON paper_trades(asset);
CREATE INDEX IF NOT EXISTS idx_trading_alerts_user_ack ON trading_alerts(user_id, acknowledged);
CREATE INDEX IF NOT EXISTS idx_trading_alerts_severity ON trading_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_orchestrator_metrics_timestamp ON orchestrator_metrics(run_timestamp DESC);

-- Enable RLS on new tables
ALTER TABLE paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orchestrator_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for paper_trades
CREATE POLICY "Users can view their own paper trades"
  ON paper_trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own paper trades"
  ON paper_trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own paper trades"
  ON paper_trades FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage paper trades"
  ON paper_trades FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- RLS Policies for trading_alerts
CREATE POLICY "Users can view their own trading alerts"
  ON trading_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own trading alerts"
  ON trading_alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage trading alerts"
  ON trading_alerts FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- RLS Policies for orchestrator_metrics
CREATE POLICY "Admins can view orchestrator metrics"
  ON orchestrator_metrics FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage orchestrator metrics"
  ON orchestrator_metrics FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);