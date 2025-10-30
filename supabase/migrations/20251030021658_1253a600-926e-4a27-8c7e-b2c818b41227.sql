-- Drop old functions with parameters and create new ones without parameters
DROP FUNCTION IF EXISTS public.decrypt_api_key(bytea);
DROP FUNCTION IF EXISTS public.decrypt_api_secret(bytea);

-- Create new functions without parameters for RPC access
CREATE OR REPLACE FUNCTION public.decrypt_api_key()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  api_key_value text;
BEGIN
  SELECT encrypted_credentials->>'api_key'
  INTO api_key_value
  FROM public.broker_connections
  WHERE status = 'connected'
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN api_key_value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_api_secret()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  api_secret_value text;
BEGIN
  SELECT encrypted_credentials->>'api_secret'
  INTO api_secret_value
  FROM public.broker_connections
  WHERE status = 'connected'
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN api_secret_value;
END;
$function$;

-- Grant execute permissions for RPC access
GRANT EXECUTE ON FUNCTION public.decrypt_api_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_api_key() TO anon;
GRANT EXECUTE ON FUNCTION public.decrypt_api_key() TO service_role;

GRANT EXECUTE ON FUNCTION public.decrypt_api_secret() TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_api_secret() TO anon;
GRANT EXECUTE ON FUNCTION public.decrypt_api_secret() TO service_role;