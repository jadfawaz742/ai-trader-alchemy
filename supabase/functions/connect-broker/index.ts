// Version 5.0 - Added input validation with Zod (Phase 2)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { BrokerCredentialsSchema, validateInput, createValidationErrorResponse } from '../_shared/validation-schemas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('connect-broker function invoked - v5 with input validation');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Auth error: Missing Authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Proper JWT validation using Supabase
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      console.error('Auth error:', authError?.message || 'Invalid token');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Authenticated user:', user.id);
    
    // Audit log for service role operations
    await supabaseClient.from('service_role_audit').insert({
      function_name: 'connect-broker',
      action: 'authentication',
      user_id: user.id,
      metadata: { broker_action: 'pending' }
    });

    // Parse and validate request body with Zod (Phase 2)
    const body = await req.json();
    let validatedData;
    try {
      validatedData = validateInput(BrokerCredentialsSchema, body);
    } catch (error) {
      return createValidationErrorResponse(error as Error, corsHeaders);
    }
    
    const { broker_id, auth_type, credentials, action } = validatedData;

    if (action === 'validate') {
      // Validate broker credentials
      const { data: broker } = await supabaseClient
        .from('brokers')
        .select('*')
        .eq('id', broker_id)
        .single();

      if (!broker) {
        return new Response(JSON.stringify({ error: 'Broker not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let validationResult = { valid: false, error: '' };

      if (auth_type === 'api_key') {
        // Validate API key by making a test request
        if (broker.name === 'Binance') {
          validationResult = await validateBinance(credentials);
        } else if (broker.name === 'Alpaca') {
          validationResult = await validateAlpaca(credentials);
        }
      }

      if (!validationResult.valid) {
        return new Response(JSON.stringify({ 
          error: validationResult.error || 'Invalid credentials' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Encrypt credentials using pgsodium before storing
      // Note: Encryption happens at database level via trigger or we do it here
      // For now, storing in encrypted_credentials (legacy) and new encrypted columns
      
      // First, encrypt the API key and secret using pgsodium
      const { data: encryptedKey } = await supabaseClient.rpc('pgsodium.crypto_aead_det_encrypt', {
        message: credentials.api_key,
        key_id: null // Uses default encryption key from Vault
      });
      
      const { data: encryptedSecret } = await supabaseClient.rpc('pgsodium.crypto_aead_det_encrypt', {
        message: credentials.api_secret,
        key_id: null
      });

      // Store encrypted credentials with proper conflict resolution
      const { data: connection, error: insertError } = await supabaseClient
        .from('broker_connections')
        .upsert({
          user_id: user.id,
          broker_id,
          auth_type,
          encrypted_credentials: credentials, // Keep for backward compatibility during migration
          encrypted_api_key: encryptedKey,
          encrypted_api_secret: encryptedSecret,
          status: 'connected',
          last_checked_at: new Date().toISOString(),
          error_message: null,
        }, {
          onConflict: 'user_id,broker_id'
        })
        .select()
        .single();
      
      // Audit log
      await supabaseClient.from('service_role_audit').insert({
        function_name: 'connect-broker',
        action: 'credentials_stored',
        user_id: user.id,
        metadata: { broker_id, auth_type }
      });

      if (insertError) {
        console.error('Error storing broker connection:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to store connection' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        connection_id: connection.id 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'disconnect') {
      const { error: deleteError } = await supabaseClient
        .from('broker_connections')
        .update({ status: 'revoked' })
        .eq('broker_id', broker_id)
        .eq('user_id', user.id);
      
      // Audit log
      await supabaseClient.from('service_role_audit').insert({
        function_name: 'connect-broker',
        action: 'credentials_revoked',
        user_id: user.id,
        metadata: { broker_id }
      });

      if (deleteError) {
        console.error('Error disconnecting broker:', deleteError);
        return new Response(JSON.stringify({ error: 'Failed to disconnect' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in connect-broker:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function validateBinance(credentials: any): Promise<{ valid: boolean; error: string }> {
  console.log('Validating Binance credentials...');
  try {
    // Determine endpoint based on account type
    const isTestnet = credentials.account_type === 'testnet' || credentials.account_type === 'demo';
    const binanceBaseUrl = isTestnet 
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';
    
    console.log(`Using Binance ${isTestnet ? 'TESTNET' : 'LIVE'} endpoint: ${binanceBaseUrl}`);
    
    // Load VPS proxy URL
    const vpsProxyUrl = Deno.env.get('VPS_PROXY_URL');
    const usingProxy = !!vpsProxyUrl;
    
    if (usingProxy) {
      console.log('Using VPS proxy for Binance validation');
    } else {
      console.log('Using direct connection to Binance (no proxy configured)');
    }
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(credentials.api_secret);
    const messageData = encoder.encode(queryString);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Build URL - use proxy if available
    const binanceEndpoint = `/api/v3/account?${queryString}&signature=${signatureHex}`;
    const targetUrl = usingProxy 
      ? `${vpsProxyUrl}${binanceEndpoint}`
      : `${binanceBaseUrl}${binanceEndpoint}`;

    const targetHost = isTestnet ? 'testnet.binance.vision' : 'api.binance.com';
    console.log('Making request to:', usingProxy ? `VPS proxy (target: ${targetHost})` : targetHost);
    const response = await fetch(targetUrl, {
      headers: {
        'X-MBX-APIKEY': credentials.api_key,
        ...(usingProxy ? { 'X-Target-Host': targetHost } : {}),
      },
    });

    if (response.ok) {
      console.log('Binance validation successful');
      return { valid: true, error: '' };
    } else {
      const error = await response.json();
      console.error('Binance validation failed:', error);
      return { valid: false, error: error.msg || 'Invalid Binance credentials' };
    }
  } catch (error) {
    console.error('Binance validation exception:', error);
    return { valid: false, error: 'Failed to validate Binance credentials' };
  }
}

async function validateAlpaca(credentials: any): Promise<{ valid: boolean; error: string }> {
  try {
    const isPaper = credentials.account_type === 'paper';
    const baseUrl = isPaper 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    const response = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': credentials.api_key,
        'APCA-API-SECRET-KEY': credentials.api_secret,
      },
    });

    if (response.ok) {
      return { valid: true, error: '' };
    } else {
      return { valid: false, error: 'Invalid Alpaca credentials' };
    }
  } catch (error) {
    return { valid: false, error: 'Failed to validate Alpaca credentials' };
  }
}
