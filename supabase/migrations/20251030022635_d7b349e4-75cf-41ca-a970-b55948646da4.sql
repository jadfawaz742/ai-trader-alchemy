-- Drop old functions and create new ones that accept broker_conn_id
DROP FUNCTION IF EXISTS public.decrypt_api_key(text);
DROP FUNCTION IF EXISTS public.decrypt_api_secret(text);
DROP FUNCTION IF EXISTS public.decrypt_api_key();
DROP FUNCTION IF EXISTS public.decrypt_api_secret();

-- Create functions that accept broker connection ID
CREATE OR REPLACE FUNCTION public.decrypt_api_key(broker_conn_id uuid)
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
  WHERE id = broker_conn_id
    AND status = 'connected';
  
  RETURN api_key_value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_api_secret(broker_conn_id uuid)
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
  WHERE id = broker_conn_id
    AND status = 'connected';
  
  RETURN api_secret_value;
END;
$function$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.decrypt_api_key(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_api_secret(uuid) TO authenticated, anon, service_role;