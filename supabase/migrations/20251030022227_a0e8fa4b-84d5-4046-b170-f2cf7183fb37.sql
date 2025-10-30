-- Create functions that accept the parameter the VPS is passing
CREATE OR REPLACE FUNCTION public.decrypt_api_key(encrypted_data text DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  api_key_value text;
BEGIN
  -- Ignore the parameter, get from latest connected broker
  SELECT encrypted_credentials->>'api_key'
  INTO api_key_value
  FROM public.broker_connections
  WHERE status = 'connected'
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN api_key_value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_api_secret(encrypted_data text DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  api_secret_value text;
BEGIN
  -- Ignore the parameter, get from latest connected broker
  SELECT encrypted_credentials->>'api_secret'
  INTO api_secret_value
  FROM public.broker_connections
  WHERE status = 'connected'
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN api_secret_value;
END;
$function$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.decrypt_api_key(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_api_secret(text) TO authenticated, anon, service_role;