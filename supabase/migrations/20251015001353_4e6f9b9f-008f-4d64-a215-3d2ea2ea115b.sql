-- Phase 1: Critical Security Fixes Migration

-- 1. Install pgsodium extension for encryption
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- 2. Add encrypted columns to broker_connections
ALTER TABLE broker_connections 
  ADD COLUMN IF NOT EXISTS encrypted_api_key bytea,
  ADD COLUMN IF NOT EXISTS encrypted_api_secret bytea,
  ADD COLUMN IF NOT EXISTS key_id uuid;

-- 3. Make user_id NOT NULL in asset_models (checked: no orphaned records)
ALTER TABLE asset_models 
  ALTER COLUMN user_id SET NOT NULL,
  ADD CONSTRAINT fk_asset_models_user 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

-- 4. Make user_id NOT NULL in base_models (checked: no orphaned records)
ALTER TABLE base_models 
  ALTER COLUMN user_id SET NOT NULL,
  ADD CONSTRAINT fk_base_models_user 
    FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) 
    ON DELETE CASCADE;

-- 5. Fix market_data permissions - drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can create market data" ON market_data;
DROP POLICY IF EXISTS "Authenticated users can update market data" ON market_data;
DROP POLICY IF EXISTS "Authenticated users can delete market data" ON market_data;

-- Create read-only policy for authenticated users
CREATE POLICY "Users can read market data"
  ON market_data
  FOR SELECT
  TO authenticated
  USING (true);

-- 6. Create service_role_audit table for logging critical operations
CREATE TABLE IF NOT EXISTS service_role_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  action text NOT NULL,
  user_id uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_role_audit_function 
  ON service_role_audit(function_name, created_at DESC);

-- Enable RLS on audit table
ALTER TABLE service_role_audit ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
  ON service_role_audit
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert audit logs
CREATE POLICY "Service role can insert audit logs"
  ON service_role_audit
  FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);