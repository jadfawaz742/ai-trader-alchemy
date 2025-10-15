import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { StockHistoryRequestSchema, validateInput, createValidationErrorResponse } from '../_shared/validation-schemas.ts';
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
    // Phase 3: Rate limiting (50 requests/minute per IP for history - more intensive)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const clientIp = getClientIp(req);
    const rateLimitResult = await checkRateLimit(
      supabase,
      { endpoint: 'fetch-stock-history', limit: 50, windowMinutes: 1 },
      null,
      clientIp
    );
    
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult, corsHeaders);
    }
    
    // Phase 2: Input validation
    const body = await req.json();
    let validatedData;
    try {
      validatedData = validateInput(StockHistoryRequestSchema, body);
    } catch (error) {
      return createValidationErrorResponse(error as Error, corsHeaders);
    }
    
    const { symbol, range, interval } = validatedData;

    console.log(`Fetching historical data for ${symbol} (range: ${range}, interval: ${interval})`);
    
    // Yahoo Finance chart API
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
    
    const response = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      }
    });
    
    if (!response.ok) {
      console.log('Yahoo Finance request failed');
      return new Response(JSON.stringify({
        error: 'Failed to fetch data'
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const data = await response.json();
    
    if (data.chart?.result?.[0]) {
      const result = data.chart.result[0];
      const timestamps = result.timestamp;
      const quote = result.indicators.quote[0];
      
      // Format historical data
      const history = timestamps.map((ts: number, idx: number) => ({
        time: new Date(ts * 1000).toISOString(),
        price: quote.close[idx],
        open: quote.open[idx],
        high: quote.high[idx],
        low: quote.low[idx],
        volume: quote.volume[idx]
      })).filter((item: any) => item.price !== null);
      
      const response = new Response(JSON.stringify({
        symbol: symbol.toUpperCase(),
        history,
        meta: result.meta
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      
      return addRateLimitHeaders(response, rateLimitResult);
    } else {
      return new Response(JSON.stringify({
        error: 'Invalid response from Yahoo Finance'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error fetching stock history:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
