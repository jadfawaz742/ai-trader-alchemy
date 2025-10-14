// Fetch Binance portfolio balances
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Binance connection for user
    const { data: connections, error: connError } = await supabase
      .from('broker_connections')
      .select('encrypted_credentials, brokers(name)')
      .eq('user_id', user.id)
      .eq('status', 'connected');

    if (connError || !connections || connections.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No connected Binance account found',
        balances: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find Binance connection
    const binanceConn = connections.find((c: any) => c.brokers?.name === 'Binance');
    if (!binanceConn) {
      return new Response(JSON.stringify({ 
        error: 'No Binance account connected',
        balances: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const credentials = binanceConn.encrypted_credentials;
    
    // Fetch account balance from Binance
    const vpsProxyUrl = Deno.env.get('VPS_PROXY_URL');
    const usingProxy = !!vpsProxyUrl;
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    // Create HMAC signature
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

    const binanceEndpoint = `/api/v3/account?${queryString}&signature=${signatureHex}`;
    const targetUrl = usingProxy 
      ? `${vpsProxyUrl}${binanceEndpoint}`
      : `https://api.binance.com${binanceEndpoint}`;

    const response = await fetch(targetUrl, {
      headers: {
        'X-MBX-APIKEY': credentials.api_key,
        ...(usingProxy ? { 'X-Target-Host': 'api.binance.com' } : {}),
      },
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Binance API error:', error);
      return new Response(JSON.stringify({ 
        error: error.msg || 'Failed to fetch Binance portfolio',
        balances: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accountData = await response.json();
    
    // Filter out zero balances and format
    const balances = accountData.balances
      .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b: any) => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked)
      }));

    return new Response(JSON.stringify({ 
      balances,
      canTrade: accountData.canTrade,
      canWithdraw: accountData.canWithdraw,
      canDeposit: accountData.canDeposit,
      updateTime: accountData.updateTime
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error fetching Binance portfolio:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      balances: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
