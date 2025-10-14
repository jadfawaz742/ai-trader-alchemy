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

    console.log(`📊 Fetching Binance symbols from: ${exchangeInfoUrl}`);

    const response = await fetch(exchangeInfoUrl, {
      headers: {
        'Accept-Encoding': 'identity',
        ...(usingProxy ? { 'X-Target-Host': 'api.binance.com' } : {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Binance API error:', errorText);
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch Binance symbols',
        symbols: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Manual decompression if response is gzipped
    let data;
    const contentEncoding = response.headers.get('content-encoding');
    console.log(`📦 Content-Encoding: ${contentEncoding}`);

    if (contentEncoding === 'gzip') {
      console.log('🔧 Manually decompressing gzip response...');
      const stream = response.body?.pipeThrough(new DecompressionStream('gzip'));
      const decompressed = await new Response(stream).text();
      data = JSON.parse(decompressed);
      console.log('✅ Manual decompression successful');
    } else {
      data = await response.json();
    }
    
    // Validate response structure
    console.log(`📋 Response has symbols array: ${!!data?.symbols}`);
    console.log(`📋 Response symbols count: ${data?.symbols?.length || 0}`);
    
    if (!data || !data.symbols || !Array.isArray(data.symbols)) {
      console.error('❌ Invalid response structure from VPS proxy, trying direct Binance API...');
      
      // Fallback to direct Binance API
      const directResponse = await fetch('https://api.binance.com/api/v3/exchangeInfo');
      if (!directResponse.ok) {
        throw new Error('Both VPS proxy and direct Binance API failed');
      }
      data = await directResponse.json();
      console.log(`✅ Direct Binance API returned ${data?.symbols?.length || 0} symbols`);
    }
    
    // Log first few symbols for debugging
    if (data.symbols && data.symbols.length > 0) {
      console.log(`📊 First 3 symbols:`, data.symbols.slice(0, 3).map((s: any) => s.symbol));
    }
    
    // Filter for USDT trading pairs that are actively trading
    let usdtPairs = (data.symbols || [])
      .filter((s: any) => 
        s.quoteAsset === 'USDT' && 
        s.status === 'TRADING' &&
        s.permissions?.includes('SPOT')
      )
      .map((s: any) => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset
      }))
      .sort((a: any, b: any) => a.symbol.localeCompare(b.symbol));

    console.log(`✅ Found ${usdtPairs.length} USDT trading pairs`);
    
    // If VPS proxy returned 0 USDT pairs, fall back to direct Binance API
    if (usdtPairs.length === 0) {
      console.log('⚠️ VPS proxy returned 0 USDT pairs, falling back to direct Binance API...');
      
      const directResponse = await fetch('https://api.binance.com/api/v3/exchangeInfo');
      if (!directResponse.ok) {
        throw new Error('Both VPS proxy and direct Binance API failed');
      }
      data = await directResponse.json();
      console.log(`✅ Direct Binance API returned ${data?.symbols?.length || 0} symbols`);
      
      // Re-filter for USDT pairs from direct API
      usdtPairs = (data.symbols || [])
        .filter((s: any) => 
          s.quoteAsset === 'USDT' && 
          s.status === 'TRADING' &&
          s.permissions?.includes('SPOT')
        )
        .map((s: any) => ({
          symbol: s.symbol,
          baseAsset: s.baseAsset,
          quoteAsset: s.quoteAsset
        }))
        .sort((a: any, b: any) => a.symbol.localeCompare(b.symbol));
        
      console.log(`✅ Found ${usdtPairs.length} USDT pairs from direct Binance API`);
    }

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
