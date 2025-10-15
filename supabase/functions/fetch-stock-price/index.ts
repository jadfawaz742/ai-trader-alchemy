import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { StockPriceRequestSchema, validateInput, createValidationErrorResponse } from '../_shared/validation-schemas.ts';
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
      { endpoint: 'fetch-stock-price', limit: 100, windowMinutes: 1 },
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
      validatedData = validateInput(StockPriceRequestSchema, body);
    } catch (error) {
      return createValidationErrorResponse(error as Error, corsHeaders);
    }
    
    const { symbol } = validatedData;

    console.log(`Fetching price for ${symbol} from Yahoo Finance`);
    
    // Yahoo Finance API endpoint (free, no API key needed)
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    
    const response = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      }
    });
    
    if (!response.ok) {
      console.error('Yahoo Finance request failed');
      return new Response(JSON.stringify({
        error: 'Failed to fetch stock data from Yahoo Finance'
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const data = await response.json();
    
    if (data.chart?.result?.[0]) {
      const result = data.chart.result[0];
      const meta = result.meta;
      const quote = result.indicators.quote[0];
      
      const currentPrice = meta.regularMarketPrice || quote.close[quote.close.length - 1];
      const previousClose = meta.previousClose || meta.chartPreviousClose;
      const change = currentPrice - previousClose;
      const changePercent = (change / previousClose) * 100;
      
      const response = new Response(JSON.stringify({
        symbol: symbol.toUpperCase(),
        price: currentPrice,
        change: change,
        changePercent: changePercent,
        volume: meta.regularMarketVolume || 0,
        high: meta.regularMarketDayHigh || quote.high[quote.high.length - 1],
        low: meta.regularMarketDayLow || quote.low[quote.low.length - 1],
        previousClose: previousClose,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      
      return addRateLimitHeaders(response, rateLimitResult);
    } else {
      console.error('Invalid Yahoo Finance response structure');
      return new Response(JSON.stringify({
        error: 'Invalid response from Yahoo Finance'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error fetching stock price:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
