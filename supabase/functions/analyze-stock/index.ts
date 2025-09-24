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

// API keys
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const newsApiKey = Deno.env.get('NEWS_API_KEY');

// Add logging to debug API key issues
console.log('OpenAI API Key exists:', !!openAIApiKey);
console.log('OpenAI API Key length:', openAIApiKey?.length || 0);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header to identify the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user from JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { symbol, analysisType = 'technical' } = await req.json();

    if (!symbol) {
      return new Response(JSON.stringify({ error: 'Stock symbol is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use mock analysis consistently to avoid API errors
    console.log(`Analyzing stock: ${symbol} with type: ${analysisType}`);

    // Fetch market data (mock for now)
    console.log(`Fetching market data for ${symbol}`);
    const marketData = await fetchStockData(symbol);

    // Always use mock analysis for now to avoid API errors
    console.log('Generating comprehensive mock analysis...');
    const llmAnalysis = await generateMockAnalysis(symbol, marketData, analysisType, null);

    // Parse the analysis result to extract recommendation, confidence, and sentiment
    const analysisResult = parseAnalysisResult(llmAnalysis);

    // Store analysis in database with user_id for security
    const { data: analysisData, error: dbError } = await supabase
      .from('stock_analysis')
      .insert({
        symbol: symbol.toUpperCase(),
        company_name: `${symbol.toUpperCase()} Corporation`,
        analysis_type: analysisType,
        llm_analysis: llmAnalysis,
        market_data: { ...marketData },
        sentiment_score: analysisResult.sentiment,
        recommendation: analysisResult.recommendation,
        confidence_score: analysisResult.confidence,
        user_id: user.id, // Associate analysis with authenticated user
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

    // Update market data cache only if marketData exists
    if (marketData) {
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
    }

    return new Response(JSON.stringify({ 
      success: true, 
      analysis: analysisData,
      marketData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-stock function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
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

async function generateLLMAnalysis(symbol: string, marketData: any, analysisType: string, newsData: any = null) {
  try {
    // Check if OpenAI API key is available
    if (!openAIApiKey) {
      console.log('OpenAI API key not found, using mock analysis');
      return generateMockAnalysis(symbol, marketData, analysisType, newsData);
    }

    console.log('Calling OpenAI API for analysis...');
    
    // Prepare news context
    const newsContext = newsData?.articles?.length > 0 
      ? `\n\nRECENT NEWS HEADLINES:\n${newsData.articles.map((article: any) => `- ${article.title} (${article.sentiment} sentiment)`).join('\n')}\n\nNews Summary: ${newsData.articles.length} recent articles found. Sentiment distribution: ${
          newsData.articles.reduce((acc: any, article: any) => {
            acc[article.sentiment] = (acc[article.sentiment] || 0) + 1;
            return acc;
          }, {})
        }`
      : '\n\nNo recent news available for this stock.';

    const prompt = `
As an expert financial analyst with access to real-time market news, analyze the stock ${symbol} with HEAVY EMPHASIS on news sentiment integration:

MARKET DATA:
Current Price: $${marketData.currentPrice?.toFixed(2)}
Price Change: $${marketData.priceChange?.toFixed(2)} (${marketData.priceChangePercent?.toFixed(2)}%)
Volume: ${marketData.volume?.toLocaleString()}
Market Cap: $${marketData.marketCap?.toLocaleString()}
P/E Ratio: ${marketData.peRatio?.toFixed(2)}
52-Week High: $${marketData.fiftyTwoWeekHigh?.toFixed(2)}
52-Week Low: $${marketData.fiftyTwoWeekLow?.toFixed(2)}
Beta: ${marketData.beta?.toFixed(2)}${newsContext}

CRITICAL INSTRUCTIONS:
1. NEWS SENTIMENT must be the PRIMARY factor in your recommendation (70% weight)
2. Market data should be SECONDARY (30% weight)
3. If news sentiment is overwhelmingly positive/negative, let it override technical indicators
4. Consider news recency - more recent news has higher impact
5. Analyze how news sentiment will affect BOTH short-term (1-7 days) and medium-term (1-3 months) price movements

Required Analysis (prioritize news impact in each section):
1. **NEWS IMPACT ASSESSMENT** (most important): How will current news sentiment drive price action?
2. **SENTIMENT-DRIVEN RECOMMENDATION**: BUY/SELL/HOLD based primarily on news sentiment
3. **NEWS-ADJUSTED PRICE TARGETS**: Factor in news momentum for realistic targets
4. **TRADING TIMELINE**: When to enter/exit based on news cycles
5. **CONFIDENCE SCORE** (0-100%): Higher confidence when news and technicals align
6. **RISK FACTORS**: How negative news could impact the position
7. **CATALYST WATCH**: Upcoming news events that could move the stock

NEWS WEIGHTING RULES:
- Positive news sentiment (>3 positive articles) = Strong BUY bias
- Mixed news sentiment = Consider technical factors more
- Negative news sentiment (>2 negative articles) = Strong SELL bias
- No recent news = Rely more on technical analysis but mention this limitation

Format: Start with "NEWS-DRIVEN ANALYSIS" and make news impact clear in every section.
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
      return generateMockAnalysis(symbol, marketData, analysisType, newsData);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating LLM analysis:', error);
    console.log('Falling back to mock analysis due to error');
    return generateMockAnalysis(symbol, marketData, analysisType, newsData);
  }
}

async function fetchNewsData(symbol: string, companyName: string) {
  if (!newsApiKey) {
    console.log('News API key not available');
    return { articles: [], totalResults: 0 };
  }

  try {
    console.log(`Fetching news for ${symbol} (${companyName})`);
    
    const newsResponse = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(companyName || symbol)}&sortBy=publishedAt&pageSize=5&apiKey=${newsApiKey}`
    );

    if (!newsResponse.ok) {
      console.error(`News API error: ${newsResponse.status}`);
      return { articles: [], totalResults: 0 };
    }

    const rawNewsData = await newsResponse.json();
    
    const articles = rawNewsData.articles
      ?.filter((article: any) => 
        article.title && 
        article.description && 
        article.publishedAt &&
        (article.title.toLowerCase().includes(symbol.toLowerCase()) ||
         article.title.toLowerCase().includes(companyName?.toLowerCase()) ||
         article.description.toLowerCase().includes(symbol.toLowerCase()) ||
         article.description.toLowerCase().includes(companyName?.toLowerCase()))
      )
      .slice(0, 5)
      .map((article: any) => ({
        title: article.title,
        description: article.description,
        url: article.url,
        source: article.source.name,
        publishedAt: article.publishedAt,
        sentiment: analyzeSentiment(article.title + ' ' + article.description)
      })) || [];

    return { articles, totalResults: articles.length };
  } catch (error) {
    console.error('Error fetching news:', error);
    return { articles: [], totalResults: 0 };
  }
}

function generateMockAnalysis(symbol: string, marketData: any, analysisType: string, newsData: any = null) {
  const isPositive = marketData.priceChange > 0;
  const sentiment = isPositive ? 'bullish' : marketData.priceChange < -2 ? 'bearish' : 'neutral';
  const recommendation = isPositive && marketData.priceChangePercent > 3 ? 'BUY' : 
                        marketData.priceChangePercent < -5 ? 'SELL' : 'HOLD';
  
  const newsContext = newsData?.articles?.length > 0 
    ? `\n\nNEWS SENTIMENT ANALYSIS:\nFound ${newsData.articles.length} recent articles. Overall sentiment: ${
        newsData.articles.reduce((acc: any, article: any) => {
          acc[article.sentiment] = (acc[article.sentiment] || 0) + 1;
          return acc;
        }, {})
      }\nRecent headlines: ${newsData.articles.slice(0, 2).map((a: any) => a.title).join('; ')}`
    : '\n\nNEWS: No recent news available for comprehensive analysis.';
  
  return `
TECHNICAL ANALYSIS FOR ${symbol}

MARKET SENTIMENT: ${sentiment.toUpperCase()}
The current price action shows ${sentiment} momentum based on today's ${marketData.priceChangePercent > 0 ? 'gains' : 'losses'} of ${Math.abs(marketData.priceChangePercent).toFixed(2)}%.${newsContext}

KEY INDICATORS:
• Current Price: $${marketData.currentPrice.toFixed(2)}
• Trading Volume: ${marketData.volume.toLocaleString()} (${marketData.volume > 5000000 ? 'High' : 'Moderate'} activity)
• P/E Ratio: ${marketData.peRatio.toFixed(2)} (${marketData.peRatio < 15 ? 'Undervalued' : marketData.peRatio > 25 ? 'Overvalued' : 'Fair value'})
• Beta: ${marketData.beta.toFixed(2)} (${marketData.beta > 1.2 ? 'High volatility' : 'Moderate risk'})

TECHNICAL OUTLOOK:
The stock is currently trading ${((marketData.currentPrice - marketData.fiftyTwoWeekLow) / (marketData.fiftyTwoWeekHigh - marketData.fiftyTwoWeekLow) * 100).toFixed(1)}% within its 52-week range. 
${isPositive ? 'Positive momentum suggests potential for continued upward movement.' : 'Recent weakness may present buying opportunities for long-term investors.'}

NEWS IMPACT:
${newsData?.articles?.length > 0 
  ? `Recent news sentiment appears ${newsData.articles.filter((a: any) => a.sentiment === 'positive').length > newsData.articles.filter((a: any) => a.sentiment === 'negative').length ? 'positive' : 'mixed'}, which may ${newsData.articles.filter((a: any) => a.sentiment === 'positive').length > 0 ? 'support' : 'pressure'} the stock price in the near term.`
  : 'Limited news coverage suggests market attention is moderate. Price movements likely driven by technical factors.'}

RECOMMENDATION: ${recommendation}
Confidence Level: ${Math.floor(Math.random() * 30) + 65}%

Price Target: $${(marketData.currentPrice * (isPositive ? 1.08 : 0.95)).toFixed(2)} (${isPositive ? '8% upside' : '5% downside risk'})
Timeframe: 30-60 days

RISK FACTORS:
• Market volatility and sector rotation
• Economic indicators and earnings reports
• ${newsData?.articles?.length > 0 ? 'News sentiment shifts could impact short-term performance' : 'Limited news coverage may lead to increased volatility'}
• ${marketData.beta > 1.2 ? 'High beta indicates sensitivity to market movements' : 'Moderate correlation with overall market trends'}

NOTE: This is a demonstration analysis. In production, this would be generated by GPT-4 with real-time market and news analysis.
`;
}

function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const positiveWords = ['gain', 'rise', 'bull', 'profit', 'growth', 'increase', 'up', 'surge', 'rally', 'boost', 'strong', 'beat', 'exceed', 'outperform'];
  const negativeWords = ['loss', 'fall', 'bear', 'decline', 'decrease', 'down', 'drop', 'crash', 'plunge', 'weak', 'miss', 'underperform', 'cut', 'lower'];
  
  const lowerText = text.toLowerCase();
  const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
  const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
  
  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
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