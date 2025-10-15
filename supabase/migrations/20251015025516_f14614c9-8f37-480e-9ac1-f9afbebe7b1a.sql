-- Phase 6: Production Optimization & Advanced Analytics
-- Materialized Views, Partitioning, and Performance Indexes

-- =====================================================
-- 1. MATERIALIZED VIEWS FOR ANALYTICS
-- =====================================================

-- Hourly signal performance materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_signal_performance AS
SELECT 
  date_trunc('hour', created_at) as hour,
  asset,
  COUNT(*) as total_signals,
  COUNT(*) FILTER (WHERE status = 'executed') as executed,
  COUNT(*) FILTER (WHERE status = 'blocked_by_risk') as blocked,
  AVG(confluence_score) as avg_confluence,
  AVG(EXTRACT(EPOCH FROM (executed_at - created_at))) as avg_latency_sec
FROM signals
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY date_trunc('hour', created_at), asset;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_hourly_signal_perf ON mv_hourly_signal_performance (hour, asset);

-- Daily model performance comparison
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_model_metrics AS
SELECT
  DATE(s.created_at) as trade_date,
  s.asset,
  s.model_version,
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE pt.pnl > 0) as winning_trades,
  SUM(pt.pnl) as daily_pnl,
  AVG(pt.pnl) as avg_pnl,
  STDDEV(pt.pnl) as pnl_std_dev
FROM signals s
LEFT JOIN paper_trades pt ON pt.signal_id = s.id AND pt.status = 'closed'
WHERE s.created_at > NOW() - INTERVAL '90 days'
GROUP BY DATE(s.created_at), s.asset, s.model_version;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_model_metrics ON mv_daily_model_metrics (trade_date, asset, model_version);

-- Pre-aggregated user statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_trading_stats AS
SELECT
  s.user_id,
  COUNT(DISTINCT s.asset) as active_assets,
  SUM(pt.pnl) FILTER (WHERE pt.status = 'closed') as total_pnl,
  COUNT(*) FILTER (WHERE pt.pnl > 0 AND pt.status = 'closed')::numeric / 
    NULLIF(COUNT(*) FILTER (WHERE pt.status = 'closed'), 0) as win_rate,
  AVG(s.confluence_score) as avg_confluence,
  COUNT(DISTINCT DATE(s.created_at)) as active_days,
  MAX(s.created_at) as last_trade_date
FROM signals s
LEFT JOIN paper_trades pt ON pt.signal_id = s.id
WHERE s.created_at > NOW() - INTERVAL '30 days'
GROUP BY s.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_user_trading_stats ON mv_user_trading_stats (user_id);

-- =====================================================
-- 2. FUNCTIONS FOR MATERIALIZED VIEW REFRESH
-- =====================================================

CREATE OR REPLACE FUNCTION refresh_signal_performance_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hourly_signal_performance;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_model_metrics;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_user_stats_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_trading_stats;
END;
$$;

-- =====================================================
-- 3. ADVANCED COMPOSITE INDEXES
-- =====================================================

-- Composite index for live trading queries (user + asset + status)
CREATE INDEX IF NOT EXISTS idx_signals_user_asset_status_created 
ON signals(user_id, asset, status, created_at DESC);

-- Index for model performance aggregations
CREATE INDEX IF NOT EXISTS idx_paper_trades_asset_status_pnl 
ON paper_trades(asset, status, created_at DESC) 
WHERE status = 'closed';

-- Index for alert retrieval (unacknowledged alerts by user)
CREATE INDEX IF NOT EXISTS idx_alerts_user_unack_severity 
ON trading_alerts(user_id, acknowledged, severity, created_at DESC) 
WHERE acknowledged = false;

-- GIN index for JSONB structural features search
CREATE INDEX IF NOT EXISTS idx_signals_structural_features 
ON signals USING GIN (structural_features);

-- Index for execution performance tracking
CREATE INDEX IF NOT EXISTS idx_executions_user_created 
ON executions(user_id, created_at DESC);

-- Index for broker connection lookups
CREATE INDEX IF NOT EXISTS idx_broker_conn_user_status 
ON broker_connections(user_id, status);

-- =====================================================
-- 4. TABLES FOR NEW FEATURES
-- =====================================================

-- Report generation history
CREATE TABLE IF NOT EXISTS report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly', 'custom')),
  report_config jsonb,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  delivered boolean NOT NULL DEFAULT false,
  file_path text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_history_user_type ON report_history(user_id, report_type, generated_at DESC);

ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own report history"
ON report_history FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage report history"
ON report_history FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- User preferences for reporting
CREATE TABLE IF NOT EXISTS user_report_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_report_enabled boolean NOT NULL DEFAULT false,
  weekly_report_enabled boolean NOT NULL DEFAULT false,
  report_delivery_time text NOT NULL DEFAULT '09:00',
  include_charts boolean NOT NULL DEFAULT true,
  include_recommendations boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE user_report_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own report preferences"
ON user_report_preferences FOR ALL
USING (auth.uid() = user_id);

-- Circuit breaker state tracking
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('closed', 'open', 'half_open')),
  failure_count integer NOT NULL DEFAULT 0,
  last_failure_at timestamp with time zone,
  opened_at timestamp with time zone,
  last_success_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_service ON circuit_breaker_state(service_name, status);

ALTER TABLE circuit_breaker_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view circuit breaker state"
ON circuit_breaker_state FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage circuit breaker state"
ON circuit_breaker_state FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Cost tracking metrics
CREATE TABLE IF NOT EXISTS infrastructure_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date date NOT NULL,
  edge_function_invocations bigint NOT NULL DEFAULT 0,
  database_storage_gb numeric NOT NULL DEFAULT 0,
  database_egress_gb numeric NOT NULL DEFAULT 0,
  estimated_cost numeric NOT NULL DEFAULT 0,
  cost_breakdown jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_infra_costs_date ON infrastructure_costs(metric_date);

ALTER TABLE infrastructure_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view infrastructure costs"
ON infrastructure_costs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage infrastructure costs"
ON infrastructure_costs FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- =====================================================
-- 5. HELPER FUNCTIONS
-- =====================================================

-- Function to get top expensive queries
CREATE OR REPLACE FUNCTION get_expensive_queries(limit_count int DEFAULT 10)
RETURNS TABLE (
  query_text text,
  avg_time_ms numeric,
  executions bigint,
  cost_impact numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    LEFT(query, 100) as query_text,
    ROUND(mean_exec_time::numeric, 2) as avg_time_ms,
    calls as executions,
    ROUND((mean_exec_time * calls / SUM(mean_exec_time * calls) OVER ())::numeric, 4) as cost_impact
  FROM pg_stat_statements
  WHERE query NOT LIKE '%pg_stat_statements%'
  ORDER BY mean_exec_time * calls DESC
  LIMIT limit_count;
$$;

-- Function to calculate portfolio correlation matrix
CREATE OR REPLACE FUNCTION calculate_portfolio_correlations(p_user_id uuid, days_back int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Simplified correlation calculation
  -- In production, this would use statistical correlation functions
  SELECT jsonb_agg(
    jsonb_build_object(
      'asset1', a1.asset,
      'asset2', a2.asset,
      'correlation', RANDOM() * 2 - 1  -- Placeholder for actual correlation
    )
  ) INTO result
  FROM (SELECT DISTINCT asset FROM paper_trades WHERE user_id = p_user_id) a1
  CROSS JOIN (SELECT DISTINCT asset FROM paper_trades WHERE user_id = p_user_id) a2
  WHERE a1.asset < a2.asset;
  
  RETURN result;
END;
$$;

-- Trigger to update updated_at on user_report_preferences
CREATE OR REPLACE FUNCTION update_report_prefs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_user_report_prefs_updated_at
  BEFORE UPDATE ON user_report_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_report_prefs_updated_at();

-- =====================================================
-- 6. INITIAL DATA
-- =====================================================

-- Initialize circuit breaker states for key services
INSERT INTO circuit_breaker_state (service_name, status)
VALUES 
  ('live_trading', 'closed'),
  ('signal_generation', 'closed'),
  ('trade_execution', 'closed'),
  ('model_inference', 'closed')
ON CONFLICT (service_name) DO NOTHING;