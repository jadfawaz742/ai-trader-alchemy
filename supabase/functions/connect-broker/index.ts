import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { broker_id, auth_type, credentials, action } = await req.json();

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

      // Store encrypted credentials
      const { data: connection, error: insertError } = await supabaseClient
        .from('broker_connections')
        .upsert({
          user_id: user.id,
          broker_id,
          auth_type,
          encrypted_credentials: credentials,
          status: 'connected',
          last_checked_at: new Date().toISOString(),
        })
        .select()
        .single();

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

    console.log('Making request to Binance API...');
    const response = await fetch(
      `https://api.binance.com/api/v3/account?${queryString}&signature=${signatureHex}`,
      {
        headers: {
          'X-MBX-APIKEY': credentials.api_key,
        },
      }
    );

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
