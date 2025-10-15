-- Fix: Remove SECURITY DEFINER from audit_metrics view
-- Security definer views can bypass RLS, so we recreate as a normal view

DROP VIEW IF EXISTS audit_metrics;

CREATE OR REPLACE VIEW audit_metrics AS
SELECT 
  function_name,
  action,
  COUNT(*) as total_calls,
  COUNT(DISTINCT user_id) as unique_users,
  MAX(created_at) as last_called,
  DATE(created_at) as call_date
FROM service_role_audit
GROUP BY function_name, action, DATE(created_at);

-- Grant select on view to authenticated users (will still be filtered by RLS on underlying table)
GRANT SELECT ON audit_metrics TO authenticated;