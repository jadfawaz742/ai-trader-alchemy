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
    const { symbol } = await req.json();
    
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'Symbol is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Fetching price for ${symbol} from Yahoo Finance`);
    
    // Yahoo Finance API endpoint (free, no API key needed)
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    
    const response = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      }
    });
    
    if (!response.ok) {
      console.log('Yahoo Finance request failed, using mock data');
      return new Response(JSON.stringify({
        ...generateMockData(symbol),
        note: 'Mock data - Yahoo Finance unavailable'
      }), {
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
      
      return new Response(JSON.stringify({
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
    } else {
      console.log('Invalid Yahoo Finance response, using mock data');
      return new Response(JSON.stringify({
        ...generateMockData(symbol),
        note: 'Mock data - Invalid response'
      }), {
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

function generateMockData(symbol: string) {
  const basePrice = Math.random() * 200 + 50;
  const change = (Math.random() - 0.5) * 10;
  
  return {
    symbol: symbol.toUpperCase(),
    price: basePrice,
    change: change,
    changePercent: (change / basePrice) * 100,
    volume: Math.floor(Math.random() * 10000000),
    high: basePrice + Math.random() * 5,
    low: basePrice - Math.random() * 5,
    previousClose: basePrice - change,
  };
}
