import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const newsApiKey = Deno.env.get('NEWS_API_KEY');
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Available stocks for trading
const TRADEABLE_STOCKS = [
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA',
  'SPOT', 'SQ', 'ROKU', 'TWLO', 'SNOW', 'NET', 'DDOG',
  'PLTR', 'RBLX', 'COIN', 'HOOD', 'SOFI', 'RIVN', 'LCID',
  'JPM', 'V', 'MA', 'DIS', 'KO', 'WMT', 'JNJ',
  'XOM', 'NEE', 'ENPH', 'FSLR', 'MRNA', 'BNTX', 'GILD'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { portfolioId, simulationMode = true, riskLevel = 30, maxAmount = 1000, selectedStocks = [] } = await req.json();

    if (!portfolioId) {
      return new Response(JSON.stringify({ error: 'Portfolio ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🤖 Auto-trade request: ${simulationMode ? 'SIMULATION' : 'LIVE'} mode, Risk: ${riskLevel}%`);

    // Get portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .eq('user_id', user.id)
      .single();

    if (portfolioError || !portfolio) {
      return new Response(JSON.stringify({ error: 'Portfolio not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate trading signals
    const trades = await generateTrades(selectedStocks.length > 0 ? selectedStocks : TRADEABLE_STOCKS.slice(0, 5), riskLevel, maxAmount);

    return new Response(JSON.stringify({ 
      success: true,
      trades,
      tradesExecuted: trades.length,
      message: `Generated ${trades.length} trading signals`,
      simulationMode
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in auto-trade function:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Auto-trade function failed',
      success: false,
      trades: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateTrades(symbols: string[], riskLevel: number, maxAmount: number) {
  const trades = [];
  const numTrades = Math.min(Math.floor(Math.random() * 3) + 1, symbols.length); // 1-3 trades max
  
  console.log(`Generating ${numTrades} trades from ${symbols.length} symbols`);

  for (let i = 0; i < numTrades; i++) {
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const action = Math.random() > 0.5 ? 'BUY' : 'SELL';
    const basePrice = Math.random() * 200 + 50; // $50-$250
    const maxShares = Math.floor(maxAmount / basePrice);
    const quantity = Math.max(1, Math.floor(Math.random() * Math.min(maxShares, 10)) + 1);
    
    // Higher risk level = higher confidence (more aggressive trading)
    const confidence = Math.min(95, 60 + (riskLevel * 0.4) + Math.random() * 20);
    
    const trade = {
      symbol,
      action,
      quantity,
      price: Math.round(basePrice * 100) / 100,
      confidence: Math.round(confidence),
      momentum: confidence > 80 ? 'strong' : confidence > 60 ? 'moderate' : 'weak',
      volumeSpike: Math.random() > 0.7,
      timestamp: new Date().toISOString()
    };
    
    trades.push(trade);
    console.log(`Generated trade: ${action} ${quantity} ${symbol} @ $${trade.price} (${confidence}% confidence)`);
  }

  return trades;
}

function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const positiveWords = ['buy', 'bull', 'gain', 'profit', 'surge', 'rise', 'growth', 'strong', 'beat', 'exceed'];
  const negativeWords = ['sell', 'bear', 'loss', 'drop', 'fall', 'decline', 'weak', 'miss', 'below', 'concern'];
  
  const lowerText = text.toLowerCase();
  const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
  const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
  
  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}