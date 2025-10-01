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
    const { symbol, range = '1d', interval = '5m' } = await req.json();
    
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'Symbol is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
      
      return new Response(JSON.stringify({
        symbol: symbol.toUpperCase(),
        history,
        meta: result.meta
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
