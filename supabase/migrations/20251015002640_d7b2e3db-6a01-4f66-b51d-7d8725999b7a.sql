-- Phase 6: Performance & Cleanup Improvements

-- Create view for aggregated audit metrics
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

-- Add indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_service_role_audit_created_at 
  ON service_role_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_role_audit_user_function 
  ON service_role_audit(user_id, function_name, created_at DESC);

-- Cleanup function for old audit logs (retention: 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM service_role_audit
  WHERE created_at < now() - interval '90 days';
END;
$$;

-- Migration function to move legacy credentials to encrypted columns
CREATE OR REPLACE FUNCTION migrate_legacy_credentials()
RETURNS TABLE(
  connection_id uuid,
  status text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conn RECORD;
  secret_key uuid;
  api_key_text text;
  api_secret_text text;
BEGIN
  -- Get or create encryption key
  SELECT id INTO secret_key
  FROM pgsodium.valid_key
  WHERE name = 'broker_credentials_key'
  LIMIT 1;
  
  IF secret_key IS NULL THEN
    -- Create new key if doesn't exist
    INSERT INTO pgsodium.valid_key (name)
    VALUES ('broker_credentials_key')
    RETURNING id INTO secret_key;
  END IF;
  
  -- Migrate each connection with legacy credentials
  FOR conn IN 
    SELECT id, encrypted_credentials
    FROM broker_connections
    WHERE encrypted_api_key IS NULL
      AND encrypted_credentials IS NOT NULL
  LOOP
    BEGIN
      -- Extract API key and secret from JSONB
      api_key_text := conn.encrypted_credentials->>'api_key';
      api_secret_text := conn.encrypted_credentials->>'api_secret';
      
      -- Encrypt and store in new columns
      UPDATE broker_connections
      SET 
        encrypted_api_key = pgsodium.crypto_aead_det_encrypt(
          convert_to(api_key_text, 'utf8'),
          convert_to('broker_api_key', 'utf8'),
          secret_key
        ),
        encrypted_api_secret = pgsodium.crypto_aead_det_encrypt(
          convert_to(api_secret_text, 'utf8'),
          convert_to('broker_api_secret', 'utf8'),
          secret_key
        ),
        key_id = secret_key
      WHERE id = conn.id;
      
      RETURN QUERY SELECT conn.id, 'success'::text, 'Credentials migrated successfully'::text;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT conn.id, 'error'::text, SQLERRM::text;
    END;
  END LOOP;
END;
$$;

-- Grant execute permission on cleanup function to postgres role (for cron)
GRANT EXECUTE ON FUNCTION cleanup_old_audit_logs() TO postgres;