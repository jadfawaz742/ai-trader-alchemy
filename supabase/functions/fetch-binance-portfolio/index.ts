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
        'Accept-Encoding': 'identity',
        ...(usingProxy ? { 'X-Target-Host': 'api.binance.com' } : {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Binance API error response:', errorText);
      let errorMsg = 'Failed to fetch Binance portfolio';
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.msg || errorMsg;
      } catch (e) {
        console.error('Could not parse error response:', e);
      }
      return new Response(JSON.stringify({ 
        error: errorMsg,
        balances: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Read as text first to avoid decompression issues
    const responseText = await response.text();
    console.log('Binance API response (first 200 chars):', responseText.substring(0, 200));
    
    let accountData;
    try {
      accountData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Binance response:', parseError);
      console.error('Response text:', responseText);
      return new Response(JSON.stringify({ 
        error: 'Failed to parse Binance API response',
        balances: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Filter out zero balances
    const balances = accountData.balances
      .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b: any) => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked)
      }));

    // Fetch USD prices for all assets
    const tickerPricesUrl = usingProxy 
      ? `${vpsProxyUrl}/api/v3/ticker/price`
      : `https://api.binance.com/api/v3/ticker/price`;
    
    const pricesResponse = await fetch(tickerPricesUrl, {
      headers: usingProxy ? { 'X-Target-Host': 'api.binance.com' } : {},
    });
    
    let prices: any = {};
    if (pricesResponse.ok) {
      const pricesText = await pricesResponse.text();
      const pricesData = JSON.parse(pricesText);
      prices = pricesData.reduce((acc: any, p: any) => {
        acc[p.symbol] = parseFloat(p.price);
        return acc;
      }, {});
    }

    // Calculate USD values with defensive checks
    const balancesWithUSD = balances.map((b: any) => {
      let usdValue = 0;
      let currentPrice = 0;
      
      if (b.asset === 'USDT' || b.asset === 'USDC' || b.asset === 'BUSD') {
        usdValue = b.total;
        currentPrice = 1;
      } else {
        const usdtSymbol = `${b.asset}USDT`;
        const busdSymbol = `${b.asset}BUSD`;
        const usdcSymbol = `${b.asset}USDC`;
        
        // Find the price, default to 0 if not found
        currentPrice = prices[usdtSymbol] || prices[busdSymbol] || prices[usdcSymbol] || 0;
        
        if (currentPrice > 0) {
          usdValue = b.total * currentPrice;
        } else {
          console.log(`⚠️ No price found for ${b.asset}, skipping USD calculation`);
          usdValue = 0;
        }
      }
      
      return {
        ...b,
        usdValue: usdValue || 0,  // Ensure it's never NaN
        currentPrice: currentPrice || 0
      };
    });

    const totalUsdValue = balancesWithUSD.reduce((sum: number, b: any) => sum + b.usdValue, 0);

    return new Response(JSON.stringify({ 
      balances: balancesWithUSD,
      totalUsdValue,
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
