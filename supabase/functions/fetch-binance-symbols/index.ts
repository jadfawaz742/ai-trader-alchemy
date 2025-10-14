import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const vpsProxyUrl = Deno.env.get('VPS_PROXY_URL');
    const usingProxy = !!vpsProxyUrl;
    
    const exchangeInfoUrl = usingProxy 
      ? `${vpsProxyUrl}/api/v3/exchangeInfo`
      : `https://api.binance.com/api/v3/exchangeInfo`;

    const response = await fetch(exchangeInfoUrl, {
      headers: {
        'Accept-Encoding': 'identity',
        ...(usingProxy ? { 'X-Target-Host': 'api.binance.com' } : {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Binance API error:', errorText);
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch Binance symbols',
        symbols: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    
    // Filter for USDT trading pairs that are actively trading
    const usdtPairs = data.symbols
      .filter((s: any) => 
        s.quoteAsset === 'USDT' && 
        s.status === 'TRADING' &&
        s.permissions.includes('SPOT')
      )
      .map((s: any) => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset
      }))
      .sort((a: any, b: any) => a.symbol.localeCompare(b.symbol));

    console.log(`Found ${usdtPairs.length} USDT trading pairs`);

    return new Response(JSON.stringify({ 
      symbols: usdtPairs,
      count: usdtPairs.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error fetching Binance symbols:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      symbols: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
