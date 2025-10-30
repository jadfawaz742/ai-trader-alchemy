-- Grant execute permissions on decrypt functions for RPC access
GRANT EXECUTE ON FUNCTION public.decrypt_api_key(bytea) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_api_key(bytea) TO anon;
GRANT EXECUTE ON FUNCTION public.decrypt_api_key(bytea) TO service_role;

GRANT EXECUTE ON FUNCTION public.decrypt_api_secret(bytea) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_api_secret(bytea) TO anon;
GRANT EXECUTE ON FUNCTION public.decrypt_api_secret(bytea) TO service_role;