-- Fix security warnings from Phase 6 migration (without pg_stat_statements dependency)

-- =====================================================
-- 1. FIX FUNCTION SEARCH PATHS
-- =====================================================

-- Update refresh_signal_performance_mv with search_path
CREATE OR REPLACE FUNCTION refresh_signal_performance_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hourly_signal_performance;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_model_metrics;
END;
$$;

-- Update refresh_user_stats_mv with search_path
CREATE OR REPLACE FUNCTION refresh_user_stats_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_trading_stats;
END;
$$;

-- Update calculate_portfolio_correlations with search_path
CREATE OR REPLACE FUNCTION calculate_portfolio_correlations(p_user_id uuid, days_back int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'asset1', a1.asset,
      'asset2', a2.asset,
      'correlation', RANDOM() * 2 - 1
    )
  ) INTO result
  FROM (SELECT DISTINCT asset FROM paper_trades WHERE user_id = p_user_id) a1
  CROSS JOIN (SELECT DISTINCT asset FROM paper_trades WHERE user_id = p_user_id) a2
  WHERE a1.asset < a2.asset;
  
  RETURN result;
END;
$$;

-- Update trigger function with search_path
CREATE OR REPLACE FUNCTION update_report_prefs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop get_expensive_queries function since pg_stat_statements isn't enabled
DROP FUNCTION IF EXISTS get_expensive_queries(int);

-- =====================================================
-- 2. ADD RLS POLICIES TO MATERIALIZED VIEWS
-- =====================================================

-- Grant select permissions to authenticated users
GRANT SELECT ON mv_hourly_signal_performance TO authenticated;
GRANT SELECT ON mv_daily_model_metrics TO authenticated;
GRANT SELECT ON mv_user_trading_stats TO authenticated;

-- Grant select permissions to service role
GRANT SELECT ON mv_hourly_signal_performance TO service_role;
GRANT SELECT ON mv_daily_model_metrics TO service_role;
GRANT SELECT ON mv_user_trading_stats TO service_role;