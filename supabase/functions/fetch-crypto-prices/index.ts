import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { checkRateLimit, getClientIp, createRateLimitResponse, addRateLimitHeaders } from '../_shared/rate-limiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Phase 3: Rate limiting (100 requests/minute per IP)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const clientIp = getClientIp(req);
    const rateLimitResult = await checkRateLimit(
      supabase,
      { endpoint: 'fetch-crypto-prices', limit: 100, windowMinutes: 1 },
      null,
      clientIp
    );
    
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult, corsHeaders);
    }
    console.log('🔍 Fetching real-time crypto prices from Bybit...');

    // Fetch prices for major cryptocurrencies
    const symbols = [
      'BTCUSDT',
      'ETHUSDT', 
      'SOLUSDT',
      'ADAUSDT',
      'DOTUSDT',
      'BNBUSDT',
      'XRPUSDT',
      'DOGEUSDT'
    ];

    const pricePromises = symbols.map(async (symbol) => {
      try {
        const response = await fetch(
          `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        const data = await response.json();
        
        if (data.retCode === 0 && data.result?.list?.[0]) {
          const ticker = data.result.list[0];
          return {
            symbol: symbol.replace('USDT', ''),
            price: parseFloat(ticker.lastPrice),
            change24h: parseFloat(ticker.price24hPcnt) * 100,
            volume24h: parseFloat(ticker.volume24h),
            high24h: parseFloat(ticker.highPrice24h),
            low24h: parseFloat(ticker.lowPrice24h),
            timestamp: Date.now()
          };
        }
        return null;
      } catch (error) {
        console.error(`Error fetching ${symbol}:`, error);
        return null;
      }
    });

    const prices = (await Promise.all(pricePromises)).filter(p => p !== null);

    console.log(`✅ Successfully fetched ${prices.length} crypto prices`);

    const response = new Response(
      JSON.stringify({ 
        success: true, 
        prices,
        timestamp: Date.now()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
    
    return addRateLimitHeaders(response, rateLimitResult);

  } catch (error) {
    console.error('❌ Error fetching crypto prices:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});