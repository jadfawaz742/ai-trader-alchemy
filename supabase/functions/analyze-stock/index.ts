import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// OpenAI API key
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

// Add logging to debug API key issues
console.log('OpenAI API Key exists:', !!openAIApiKey);
console.log('OpenAI API Key length:', openAIApiKey?.length || 0);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, analysisType = 'technical' } = await req.json();

    if (!symbol) {
      return new Response(JSON.stringify({ error: 'Stock symbol is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Analyzing stock: ${symbol} with type: ${analysisType}`);

    // Fetch stock data from Alpha Vantage (free API)
    const marketData = await fetchStockData(symbol);
    
    if (!marketData) {
      return new Response(JSON.stringify({ error: 'Failed to fetch market data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate LLM analysis
    const llmAnalysis = await generateLLMAnalysis(symbol, marketData, analysisType);
    
    // Parse recommendation and confidence from LLM response
    const { recommendation, confidence, sentiment } = parseAnalysisResult(llmAnalysis);

    // Store analysis in database
    const { data: analysisData, error: dbError } = await supabase
      .from('stock_analysis')
      .insert({
        symbol: symbol.toUpperCase(),
        company_name: marketData.companyName,
        analysis_type: analysisType,
        llm_analysis: llmAnalysis,
        market_data: marketData,
        sentiment_score: sentiment,
        recommendation: recommendation,
        confidence_score: confidence,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return new Response(JSON.stringify({ error: 'Failed to save analysis' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update market data cache
    await supabase
      .from('market_data')
      .upsert({
        symbol: symbol.toUpperCase(),
        current_price: marketData.currentPrice,
        price_change: marketData.priceChange,
        price_change_percent: marketData.priceChangePercent,
        volume: marketData.volume,
        market_cap: marketData.marketCap,
        pe_ratio: marketData.peRatio,
        raw_data: marketData,
        last_updated: new Date().toISOString(),
      }, {
        onConflict: 'symbol'
      });

    return new Response(JSON.stringify({ 
      success: true, 
      analysis: analysisData,
      marketData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-stock function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchStockData(symbol: string) {
  try {
    // Using Alpha Vantage free API (demo data for now)
    // In production, you would use a real API key
    console.log(`Fetching market data for ${symbol}`);
    
    // Mock data for demonstration - replace with real API call
    const mockData = {
      companyName: `${symbol.toUpperCase()} Corporation`,
      currentPrice: Math.random() * 200 + 50, // Random price between 50-250
      priceChange: (Math.random() - 0.5) * 10, // Random change -5 to +5
      priceChangePercent: (Math.random() - 0.5) * 10, // Random % change
      volume: Math.floor(Math.random() * 10000000), // Random volume
      marketCap: Math.floor(Math.random() * 1000000000000), // Random market cap
      peRatio: Math.random() * 30 + 5, // Random P/E ratio
      dayHigh: Math.random() * 200 + 50,
      dayLow: Math.random() * 200 + 50,
      fiftyTwoWeekHigh: Math.random() * 250 + 100,
      fiftyTwoWeekLow: Math.random() * 100 + 30,
      dividend: Math.random() * 5,
      beta: Math.random() * 2 + 0.5,
    };

    return mockData;
  } catch (error) {
    console.error('Error fetching stock data:', error);
    return null;
  }
}

async function generateLLMAnalysis(symbol: string, marketData: any, analysisType: string) {
  try {
    // Check if OpenAI API key is available
    if (!openAIApiKey) {
      console.log('OpenAI API key not found, using mock analysis');
      return generateMockAnalysis(symbol, marketData, analysisType);
    }

    console.log('Calling OpenAI API for analysis...');
    const prompt = `
As an expert financial analyst, analyze the stock ${symbol} based on the following market data:

Current Price: $${marketData.currentPrice?.toFixed(2)}
Price Change: $${marketData.priceChange?.toFixed(2)} (${marketData.priceChangePercent?.toFixed(2)}%)
Volume: ${marketData.volume?.toLocaleString()}
Market Cap: $${marketData.marketCap?.toLocaleString()}
P/E Ratio: ${marketData.peRatio?.toFixed(2)}
52-Week High: $${marketData.fiftyTwoWeekHigh?.toFixed(2)}
52-Week Low: $${marketData.fiftyTwoWeekLow?.toFixed(2)}
Beta: ${marketData.beta?.toFixed(2)}

Analysis Type: ${analysisType}

Please provide a comprehensive ${analysisType} analysis including:
1. Current market sentiment (bullish/bearish/neutral)
2. Key technical or fundamental indicators
3. Risk factors and opportunities
4. Clear recommendation (BUY/SELL/HOLD)
5. Confidence level (0-100%)
6. Price targets and timeframe

Format your response to include specific sections and be actionable for trading decisions.
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are a professional financial analyst with expertise in stock market analysis. Provide clear, actionable insights.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error(`OpenAI API error: ${response.status}`);
      console.log('Falling back to mock analysis due to API error');
      return generateMockAnalysis(symbol, marketData, analysisType);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating LLM analysis:', error);
    console.log('Falling back to mock analysis due to error');
    return generateMockAnalysis(symbol, marketData, analysisType);
  }
}

function generateMockAnalysis(symbol: string, marketData: any, analysisType: string) {
  const isPositive = marketData.priceChange > 0;
  const sentiment = isPositive ? 'bullish' : marketData.priceChange < -2 ? 'bearish' : 'neutral';
  const recommendation = isPositive && marketData.priceChangePercent > 3 ? 'BUY' : 
                        marketData.priceChangePercent < -5 ? 'SELL' : 'HOLD';
  
  return `
TECHNICAL ANALYSIS FOR ${symbol}

MARKET SENTIMENT: ${sentiment.toUpperCase()}
The current price action shows ${sentiment} momentum based on today's ${marketData.priceChangePercent > 0 ? 'gains' : 'losses'} of ${Math.abs(marketData.priceChangePercent).toFixed(2)}%.

KEY INDICATORS:
• Current Price: $${marketData.currentPrice.toFixed(2)}
• Trading Volume: ${marketData.volume.toLocaleString()} (${marketData.volume > 5000000 ? 'High' : 'Moderate'} activity)
• P/E Ratio: ${marketData.peRatio.toFixed(2)} (${marketData.peRatio < 15 ? 'Undervalued' : marketData.peRatio > 25 ? 'Overvalued' : 'Fair value'})
• Beta: ${marketData.beta.toFixed(2)} (${marketData.beta > 1.2 ? 'High volatility' : 'Moderate risk'})

TECHNICAL OUTLOOK:
The stock is currently trading ${((marketData.currentPrice - marketData.fiftyTwoWeekLow) / (marketData.fiftyTwoWeekHigh - marketData.fiftyTwoWeekLow) * 100).toFixed(1)}% within its 52-week range. 
${isPositive ? 'Positive momentum suggests potential for continued upward movement.' : 'Recent weakness may present buying opportunities for long-term investors.'}

RECOMMENDATION: ${recommendation}
Confidence Level: ${Math.floor(Math.random() * 30) + 65}%

Price Target: $${(marketData.currentPrice * (isPositive ? 1.08 : 0.95)).toFixed(2)} (${isPositive ? '8% upside' : '5% downside risk'})
Timeframe: 30-60 days

RISK FACTORS:
• Market volatility and sector rotation
• Economic indicators and earnings reports
• ${marketData.beta > 1.2 ? 'High beta indicates sensitivity to market movements' : 'Moderate correlation with overall market trends'}

NOTE: This is a demonstration analysis. In production, this would be generated by GPT-4 with real-time market analysis.
`;
}

function parseAnalysisResult(analysisText: string) {
  // Extract recommendation, confidence, and sentiment from LLM response
  const recommendationMatch = analysisText.match(/(?:recommendation|recommend)[:\s]*([A-Z]+)/i);
  const confidenceMatch = analysisText.match(/confidence[:\s]*(\d+)%?/i);
  
  // Simple sentiment analysis based on keywords
  const bullishWords = ['bullish', 'buy', 'positive', 'strong', 'growth', 'upward'];
  const bearishWords = ['bearish', 'sell', 'negative', 'weak', 'decline', 'downward'];
  
  const text = analysisText.toLowerCase();
  const bullishCount = bullishWords.filter(word => text.includes(word)).length;
  const bearishCount = bearishWords.filter(word => text.includes(word)).length;
  
  let sentiment = 0; // neutral
  if (bullishCount > bearishCount) sentiment = 1; // positive
  if (bearishCount > bullishCount) sentiment = -1; // negative

  return {
    recommendation: recommendationMatch ? recommendationMatch[1].toUpperCase() : 'HOLD',
    confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : 50,
    sentiment: sentiment,
  };
}