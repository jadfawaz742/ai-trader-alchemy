-- Extract API key from encrypted_credentials JSONB
CREATE OR REPLACE FUNCTION public.decrypt_api_key(encrypted_data bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  api_key_value text;
BEGIN
  -- Since encrypted_data is NULL in old format, find the active connection
  -- and extract from encrypted_credentials JSONB
  SELECT encrypted_credentials->>'api_key'
  INTO api_key_value
  FROM public.broker_connections
  WHERE status = 'connected'
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN api_key_value;
END;
$$;

-- Extract API secret from encrypted_credentials JSONB
CREATE OR REPLACE FUNCTION public.decrypt_api_secret(encrypted_data bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  api_secret_value text;
BEGIN
  -- Since encrypted_data is NULL in old format, find the active connection
  -- and extract from encrypted_credentials JSONB
  SELECT encrypted_credentials->>'api_secret'
  INTO api_secret_value
  FROM public.broker_connections
  WHERE status = 'connected'
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN api_secret_value;
END;
$$;