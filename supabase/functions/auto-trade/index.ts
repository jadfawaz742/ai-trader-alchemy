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

// Popular stocks for news-driven trading
const TRADEABLE_STOCKS = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'META', 'AMZN'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const userId = user.id;
    const requestBody = await req.json();
    const { portfolioId, simulationMode = false } = requestBody;

    console.log(`Starting NEWS-DRIVEN automated trading for user: ${userId}`);

    // Get user's portfolio and risk parameters
    const [portfolioResult, riskParamsResult] = await Promise.all([
      supabase.from('portfolios').select('*').eq('user_id', userId).single(),
      supabase.from('risk_parameters').select('*').eq('user_id', userId).single()
    ]);

    if (portfolioResult.error || riskParamsResult.error) {
      return new Response(JSON.stringify({ error: 'Portfolio or risk parameters not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const portfolio = portfolioResult.data;
    const riskParams = riskParamsResult.data;
    
    if (!simulationMode && !riskParams.auto_trading_enabled) {
      return new Response(JSON.stringify({ 
        error: 'Auto trading disabled',
        message: 'Enable auto trading in settings first'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const executedTrades = [];

    // Analyze stocks with heavy news integration
    for (const symbol of TRADEABLE_STOCKS) {
      try {
        // Get stock analysis (with news integration)
        const { data: analysisData } = await supabase
          .from('stock_analysis')
          .select('*')
          .eq('symbol', symbol)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        let analysis = analysisData;
        
        // If no recent analysis or older than 1 hour, get fresh news-integrated analysis
        if (!analysis || new Date(analysis.created_at) < new Date(Date.now() - 60 * 60 * 1000)) {
          console.log(`Getting fresh news-integrated analysis for ${symbol}...`);
          
          const marketData = await fetchMarketData(symbol);
          if (!marketData) continue;

          const newsData = await fetchNewsData(symbol, marketData.companyName);
          const llmAnalysis = await generateTradingAnalysis(symbol, marketData, newsData);
          const { recommendation, confidence, sentiment } = parseAnalysisResult(llmAnalysis);
          
          const { data: newAnalysis } = await supabase
            .from('stock_analysis')
            .insert({
              symbol: symbol.toUpperCase(),
              company_name: marketData.companyName,
              analysis_type: 'news_trading',
              llm_analysis: llmAnalysis,
              market_data: { ...marketData, news: newsData },
              sentiment_score: sentiment,
              recommendation: recommendation,
              confidence_score: confidence,
              user_id: userId
            })
            .select()
            .single();
            
          analysis = newAnalysis;
        }

        // Check if we should execute news-driven trade
        const shouldTrade = await evaluateTradeWithNews(analysis, riskParams);
        
        if (shouldTrade.execute) {
          const tradeQuantity = calculateTradeQuantity(
            shouldTrade.tradeType, 
            portfolio.current_balance, 
            riskParams.max_position_size, 
            analysis.market_data?.currentPrice || 100
          );
          
          console.log(`NEWS-DRIVEN AUTO TRADE: ${shouldTrade.tradeType} ${tradeQuantity} shares of ${symbol}`);
          
          const tradeResult = await executeTrade(
            userId,
            portfolio.id,
            symbol,
            shouldTrade.tradeType,
            tradeQuantity,
            analysis.market_data?.currentPrice || 100,
            analysis
          );
          
          if (tradeResult.success) {
            executedTrades.push({
              symbol,
              action: shouldTrade.tradeType.toLowerCase(),
              quantity: tradeQuantity,
              price: analysis.market_data?.currentPrice || 100,
              reason: `News-driven: ${shouldTrade.reason}`,
              confidence: analysis.confidence_score,
              newsImpact: extractNewsImpact(analysis.market_data?.news)
            });
          }
        }
      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
        continue;
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      tradesExecuted: executedTrades.length,
      trades: executedTrades,
      message: `News-driven trading completed. Executed ${executedTrades.length} trades based on news sentiment.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in news-driven auto-trade:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchNewsData(symbol: string, companyName: string) {
  if (!newsApiKey) {
    console.log('News API key not available for auto-trading');
    return { articles: [], totalResults: 0 };
  }

  try {
    console.log(`Fetching news for ${symbol} (${companyName}) for auto-trading`);
    
    const newsResponse = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(companyName || symbol)}&sortBy=publishedAt&pageSize=10&apiKey=${newsApiKey}`
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
      .slice(0, 10)
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
    console.error('Error fetching news for auto-trading:', error);
    return { articles: [], totalResults: 0 };
  }
}

async function fetchMarketData(symbol: string) {
  return {
    symbol,
    companyName: `${symbol.toUpperCase()} Corporation`,
    currentPrice: Math.random() * 200 + 50,
    priceChange: (Math.random() - 0.5) * 10,
    priceChangePercent: (Math.random() - 0.5) * 10,
    volume: Math.floor(Math.random() * 10000000),
    marketCap: Math.floor(Math.random() * 1000000000000),
    peRatio: Math.random() * 30 + 5,
  };
}

async function generateTradingAnalysis(symbol: string, marketData: any, newsData: any) {
  if (!openAIApiKey) {
    return generateMockTradingAnalysis(symbol, marketData, newsData);
  }

  try {
    const newsContext = newsData?.articles?.length > 0 
      ? `\n\nCRITICAL NEWS FOR TRADING:\n${newsData.articles.map((article: any) => `- ${article.title} (${article.sentiment} sentiment)`).join('\n')}\n\nNews Sentiment Summary: ${
          newsData.articles.reduce((acc: any, article: any) => {
            acc[article.sentiment] = (acc[article.sentiment] || 0) + 1;
            return acc;
          }, {})
        }`
      : '\n\nNo recent news available - technical analysis only.';

    const prompt = `
URGENT TRADING ANALYSIS FOR ${symbol} - NEWS-DRIVEN DECISION REQUIRED

Market Data:
- Current Price: $${marketData.currentPrice?.toFixed(2)}
- Price Change: ${marketData.priceChangePercent?.toFixed(2)}%
- Volume: ${marketData.volume?.toLocaleString()}${newsContext}

CRITICAL INSTRUCTIONS FOR AUTO-TRADING:
1. News sentiment is THE PRIMARY factor (80% weight) - override technical signals if news is strong
2. If 3+ positive news articles: STRONG BUY recommendation 
3. If 2+ negative news articles: STRONG SELL recommendation
4. Recent news (last 24hrs) has 2x impact vs older news
5. Consider news momentum - is sentiment building or fading?

REQUIRED IMMEDIATE TRADING DECISION:
- RECOMMENDATION: BUY/SELL/HOLD (must be definitive)
- CONFIDENCE: 0-100% (higher if news and price align)
- NEWS IMPACT: How will headlines affect price in next 1-7 days?
- ENTRY/EXIT: Specific timing based on news cycles
- RISK LEVEL: How news sentiment affects position risk

Focus on ACTIONABLE trading signals based on news momentum.
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
            content: 'You are an expert algorithmic trader who makes split-second decisions based on news sentiment and market data. Be decisive and specific.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      return generateMockTradingAnalysis(symbol, marketData, newsData);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating trading analysis:', error);
    return generateMockTradingAnalysis(symbol, marketData, newsData);
  }
}

function generateMockTradingAnalysis(symbol: string, marketData: any, newsData: any) {
  const positiveNews = newsData?.articles?.filter((a: any) => a.sentiment === 'positive').length || 0;
  const negativeNews = newsData?.articles?.filter((a: any) => a.sentiment === 'negative').length || 0;
  
  let recommendation = 'HOLD';
  let confidence = 60;
  
  if (positiveNews >= 3 || (positiveNews > negativeNews && marketData.priceChangePercent > 1)) {
    recommendation = 'BUY';
    confidence = 85;
  } else if (negativeNews >= 2 || (negativeNews > positiveNews && marketData.priceChangePercent < -1)) {
    recommendation = 'SELL'; 
    confidence = 80;
  }

  return `
NEWS-DRIVEN TRADING ANALYSIS FOR ${symbol}

IMMEDIATE TRADING DECISION: ${recommendation}
CONFIDENCE LEVEL: ${confidence}%

NEWS IMPACT ASSESSMENT:
- Positive articles: ${positiveNews}
- Negative articles: ${negativeNews}  
- Overall news sentiment: ${positiveNews > negativeNews ? 'BULLISH' : negativeNews > positiveNews ? 'BEARISH' : 'NEUTRAL'}

TRADING RATIONALE:
${recommendation === 'BUY' ? 
  `Strong positive news momentum supports upward price movement. News sentiment overrides any technical weakness.` :
  recommendation === 'SELL' ?
  `Negative news sentiment indicates downward pressure. Exit positions to avoid losses.` :
  `Mixed news sentiment - waiting for clearer directional catalyst.`}

NEWS-BASED PRICE TARGET: $${(marketData.currentPrice * (recommendation === 'BUY' ? 1.05 : recommendation === 'SELL' ? 0.95 : 1.00)).toFixed(2)}
TIMEFRAME: 3-7 days (news-driven movement typically peaks within a week)

RISK FACTORS:
- News sentiment can shift rapidly
- Market overreaction possible
- Monitor for follow-up news that could reverse trend

This is a NEWS-PRIORITIZED analysis for automated trading decisions.
`;
}

async function evaluateTradeWithNews(analysis: any, riskParams: any) {
  const newsData = analysis.market_data?.news;
  
  // News-driven decision logic
  const positiveNews = newsData?.articles?.filter((a: any) => a.sentiment === 'positive').length || 0;
  const negativeNews = newsData?.articles?.filter((a: any) => a.sentiment === 'negative').length || 0;
  
  // Strong news signals override normal thresholds
  if (positiveNews >= 3) {
    return {
      execute: true,
      tradeType: 'BUY',
      reason: `Strong positive news sentiment (${positiveNews} positive articles) - news-driven buy signal`
    };
  }
  
  if (negativeNews >= 2) {
    return {
      execute: true,
      tradeType: 'SELL', 
      reason: `Negative news sentiment (${negativeNews} negative articles) - news-driven sell signal`
    };
  }
  
  // Mixed news - fall back to traditional analysis
  if (analysis.recommendation === 'BUY' && analysis.confidence_score >= riskParams.min_confidence_score) {
    return {
      execute: true,
      tradeType: 'BUY',
      reason: `Technical + moderate news support: ${analysis.confidence_score}% confidence`
    };
  }
  
  if (analysis.recommendation === 'SELL' && analysis.confidence_score >= riskParams.min_confidence_score) {
    return {
      execute: true,
      tradeType: 'SELL',
      reason: `Technical + moderate news support: ${analysis.confidence_score}% confidence`
    };
  }
  
  return {
    execute: false,
    tradeType: 'HOLD',
    reason: `Insufficient news catalyst or confidence (${analysis.confidence_score}% vs ${riskParams.min_confidence_score}% required)`
  };
}

function extractNewsImpact(newsData: any) {
  if (!newsData?.articles?.length) return 'No news impact';
  
  const positive = newsData.articles.filter((a: any) => a.sentiment === 'positive').length;
  const negative = newsData.articles.filter((a: any) => a.sentiment === 'negative').length;
  
  if (positive > negative) return `Positive (${positive} pos, ${negative} neg)`;
  if (negative > positive) return `Negative (${positive} pos, ${negative} neg)`;
  return `Mixed (${positive} pos, ${negative} neg)`;
}

function calculateTradeQuantity(tradeType: string, balance: number, maxPositionPercent: number, price: number) {
  const maxPositionValue = (balance * maxPositionPercent) / 100;
  return Math.floor(maxPositionValue / price);
}

async function executeTrade(userId: string, portfolioId: string, symbol: string, tradeType: string, quantity: number, price: number, analysis: any) {
  try {
    const { data, error } = await supabase.functions.invoke('execute-trade', {
      body: {
        portfolioId,
        symbol,
        tradeType,
        quantity,
        price,
        analysis: analysis.llm_analysis
      }
    });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Trade execution error:', error);
    return { success: false, error: error.message };
  }
}

function parseAnalysisResult(analysisText: string) {
  const recommendationMatch = analysisText.match(/(?:recommendation|recommend)[:\s]*([A-Z]+)/i);
  const confidenceMatch = analysisText.match(/confidence[:\s]*(\d+)%?/i);
  
  const bullishWords = ['bullish', 'buy', 'positive', 'strong', 'growth', 'upward'];
  const bearishWords = ['bearish', 'sell', 'negative', 'weak', 'decline', 'downward'];
  
  const text = analysisText.toLowerCase();
  const bullishCount = bullishWords.filter(word => text.includes(word)).length;
  const bearishCount = bearishWords.filter(word => text.includes(word)).length;
  
  let sentiment = 50;
  if (bullishCount > bearishCount) sentiment = Math.min(100, 50 + (bullishCount * 10));
  if (bearishCount > bullishCount) sentiment = Math.max(0, 50 - (bearishCount * 10));

  return {
    recommendation: recommendationMatch ? recommendationMatch[1].toUpperCase() : 'HOLD',
    confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : 50,
    sentiment: sentiment,
  };
}

function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const positiveWords = ['gain', 'rise', 'bull', 'profit', 'growth', 'increase', 'up', 'surge', 'rally', 'boost', 'strong', 'beat', 'exceed', 'outperform', 'upgrade', 'buy', 'bullish'];
  const negativeWords = ['loss', 'fall', 'bear', 'decline', 'decrease', 'down', 'drop', 'crash', 'plunge', 'weak', 'miss', 'underperform', 'cut', 'lower', 'downgrade', 'sell', 'bearish'];
  
  const lowerText = text.toLowerCase();
  const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
  const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
  
  if (positiveCount > negativeCount && positiveCount > 1) return 'positive';
  if (negativeCount > positiveCount && negativeCount > 1) return 'negative';
  return 'neutral';
}