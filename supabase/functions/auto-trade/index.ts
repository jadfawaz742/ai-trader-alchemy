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
const bybitApiKey = Deno.env.get('8j5LzBaYWK7liqhBNn');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Available stocks for trading
const TRADEABLE_STOCKS = [
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA',
  'SPOT', 'SQ', 'ROKU', 'TWLO', 'SNOW', 'NET', 'DDOG',
  'PLTR', 'RBLX', 'COIN', 'HOOD', 'SOFI', 'RIVN', 'LCID',
  'JPM', 'V', 'MA', 'DIS', 'KO', 'WMT', 'JNJ',
  'XOM', 'NEE', 'ENPH', 'FSLR', 'MRNA', 'BNTX', 'GILD',
  'BTC', 'ETH' // Crypto currencies
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
  
  console.log(`🔍 Analyzing ${symbols.length} symbols with advanced technical indicators`);

  for (const symbol of symbols) {
    try {
      // Try to fetch real market data from Bybit first
      let historicalData = await fetchBybitMarketData(symbol);
      
      // Fall back to mock data if Bybit data not available
      if (!historicalData) {
        historicalData = generateMockHistoricalData(symbol);
      }
      
      // Apply technical analysis strategy
      const analysis = await applyTechnicalStrategy(symbol, historicalData, riskLevel);
      
      if (analysis.signal !== 'HOLD' && analysis.confidence >= 70) {
        const basePrice = analysis.currentPrice;
        const maxShares = Math.floor(maxAmount / basePrice);
        const quantity = Math.max(1, Math.floor(maxShares * (analysis.confidence / 100) * 0.3));
        
        const trade = {
          symbol,
          action: analysis.signal,
          quantity,
          price: Math.round(basePrice * 100) / 100,
          confidence: Math.round(analysis.confidence),
          momentum: analysis.momentum,
          volumeSpike: analysis.volumeSpike,
          rsi: analysis.rsi,
          macd: analysis.macd,
          fibLevel: analysis.fibLevel,
          strategy: 'RSI+MACD+Volume+Fibonacci',
          timestamp: new Date().toISOString()
        };
        
        trades.push(trade);
        console.log(`📊 ${analysis.signal} signal for ${symbol}: RSI=${analysis.rsi.toFixed(1)}, MACD=${analysis.macd.histogram.toFixed(3)}, Fib=${analysis.fibLevel}, Confidence=${analysis.confidence}%`);
      }
    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error);
    }
  }

  // Limit trades based on risk level
  const maxTrades = Math.min(5, Math.max(1, Math.floor(riskLevel / 20)));
  const sortedTrades = trades.sort((a, b) => b.confidence - a.confidence).slice(0, maxTrades);
  
  console.log(`✅ Generated ${sortedTrades.length} high-confidence trades`);
  return sortedTrades;
}

function generateMockHistoricalData(symbol: string) {
  const days = 50;
  const data = [];
  let basePrice = Math.random() * 150 + 50; // $50-$200
  
  for (let i = 0; i < days; i++) {
    const change = (Math.random() - 0.5) * 0.1; // ±5% daily change
    basePrice *= (1 + change);
    
    const high = basePrice * (1 + Math.random() * 0.03);
    const low = basePrice * (1 - Math.random() * 0.03);
    const volume = Math.floor(Math.random() * 2000000 + 500000);
    
    data.push({
      date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000),
      open: basePrice * (1 + (Math.random() - 0.5) * 0.01),
      high,
      low,
      close: basePrice,
      volume
    });
  }
  
  return data;
}

// Test Bybit API connection and fetch real market data
async function fetchBybitMarketData(symbol: string) {
  if (!bybitApiKey) {
    console.log(`⚠️ Bybit API key not found, using mock data for ${symbol}`);
    return null;
  }

  try {
    console.log(`🔌 Testing Bybit API connection for ${symbol}...`);
    
    // Convert symbol format (BTC -> BTCUSDT, ETH -> ETHUSDT, etc)
    const bybitSymbol = symbol.includes('BTC') ? 'BTCUSDT' : 
                        symbol.includes('ETH') ? 'ETHUSDT' : 
                        symbol + 'USDT';
    
    // Fetch current price
    const priceResponse = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${bybitSymbol}`, {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': bybitApiKey,
      },
    });

    if (!priceResponse.ok) {
      throw new Error(`Bybit API error: ${priceResponse.status} ${priceResponse.statusText}`);
    }

    const priceData = await priceResponse.json();
    console.log(`✅ Bybit API connected successfully for ${symbol}:`, priceData);

    if (priceData.result && priceData.result.list && priceData.result.list.length > 0) {
      const ticker = priceData.result.list[0];
      
      // Fetch recent klines for historical data
      const klineResponse = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=240&limit=50`, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': bybitApiKey,
        },
      });

      if (klineResponse.ok) {
        const klineData = await klineResponse.json();
        
        if (klineData.result && klineData.result.list) {
          const historicalData = klineData.result.list.reverse().map((kline: any[]) => ({
            date: new Date(parseInt(kline[0])),
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5])
          }));
          
          console.log(`📊 Fetched ${historicalData.length} data points for ${symbol} from Bybit`);
          return historicalData;
        }
      }
    }

    console.log(`⚠️ No market data found for ${symbol} on Bybit, using mock data`);
    return null;
    
  } catch (error) {
    console.error(`❌ Bybit API error for ${symbol}:`, error);
    return null;
  }
}

function generateMockHistoricalData(symbol: string) {
  const days = 50;
  const data = [];
  let basePrice = Math.random() * 150 + 50; // $50-$200
  
  for (let i = 0; i < days; i++) {
    const change = (Math.random() - 0.5) * 0.1; // ±5% daily change
    basePrice *= (1 + change);
    
    const high = basePrice * (1 + Math.random() * 0.03);
    const low = basePrice * (1 - Math.random() * 0.03);
    const volume = Math.floor(Math.random() * 2000000 + 500000);
    
    data.push({
      date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000),
      open: basePrice * (1 + (Math.random() - 0.5) * 0.01),
      high,
      low,
      close: basePrice,
      volume
    });
  }
  
  return data;
}

async function applyTechnicalStrategy(symbol: string, data: any[], riskLevel: number) {
  const currentPrice = data[data.length - 1].close;
  
  // Calculate RSI (14-period)
  const rsi = calculateRSI(data, 14);
  
  // Calculate MACD (12, 26, 9)
  const macd = calculateMACD(data, 12, 26, 9);
  
  // Analyze volume
  const volumeAnalysis = analyzeVolume(data);
  
  // Calculate Fibonacci levels
  const fibLevels = calculateFibonacciLevels(data);
  
  // Determine signal based on combined indicators
  let signal = 'HOLD';
  let confidence = 50;
  let momentum = 'neutral';
  
  // RSI Strategy
  const rsiSignal = rsi < 30 ? 'BUY' : rsi > 70 ? 'SELL' : 'HOLD';
  
  // MACD Strategy
  const macdSignal = macd.histogram > 0 && macd.macd > macd.signal ? 'BUY' : 
                     macd.histogram < 0 && macd.macd < macd.signal ? 'SELL' : 'HOLD';
  
  // Volume confirmation
  const volumeConfirmation = volumeAnalysis.spike && volumeAnalysis.trend === 'increasing';
  
  // Fibonacci support/resistance
  const nearFibLevel = findNearestFibLevel(currentPrice, fibLevels);
  const fibSignal = nearFibLevel.level < 0.382 ? 'BUY' : nearFibLevel.level > 0.618 ? 'SELL' : 'HOLD';
  
  // Combine signals
  const signals = [rsiSignal, macdSignal, fibSignal];
  const buySignals = signals.filter(s => s === 'BUY').length;
  const sellSignals = signals.filter(s => s === 'SELL').length;
  
  if (buySignals >= 2) {
    signal = 'BUY';
    confidence = Math.min(95, 70 + (buySignals * 10) + (volumeConfirmation ? 10 : 0) + (riskLevel * 0.3));
    momentum = buySignals === 3 ? 'strong' : 'moderate';
  } else if (sellSignals >= 2) {
    signal = 'SELL';
    confidence = Math.min(95, 70 + (sellSignals * 10) + (volumeConfirmation ? 10 : 0) + (riskLevel * 0.3));
    momentum = sellSignals === 3 ? 'strong' : 'moderate';
  }
  
  return {
    signal,
    confidence,
    momentum,
    currentPrice,
    rsi,
    macd,
    volumeSpike: volumeAnalysis.spike,
    fibLevel: nearFibLevel.level,
    strategy: 'Combined Technical Analysis'
  };
}

function calculateRSI(data: any[], period: number) {
  if (data.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = data.length - period; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(data: any[], fastPeriod: number, slowPeriod: number, signalPeriod: number) {
  if (data.length < slowPeriod) {
    return { macd: 0, signal: 0, histogram: 0 };
  }
  
  // Calculate EMAs
  const fastEMA = calculateEMA(data.slice(-fastPeriod).map(d => d.close), fastPeriod);
  const slowEMA = calculateEMA(data.slice(-slowPeriod).map(d => d.close), slowPeriod);
  
  const macd = fastEMA - slowEMA;
  
  // For simplicity, using SMA for signal line instead of EMA
  const signalData = data.slice(-signalPeriod).map((_, i) => {
    const fEMA = calculateEMA(data.slice(-(fastPeriod + i)).map(d => d.close), fastPeriod);
    const sEMA = calculateEMA(data.slice(-(slowPeriod + i)).map(d => d.close), slowPeriod);
    return fEMA - sEMA;
  });
  
  const signal = signalData.reduce((a, b) => a + b, 0) / signalData.length;
  const histogram = macd - signal;
  
  return { macd, signal, histogram };
}

function calculateEMA(prices: number[], period: number) {
  if (prices.length === 0) return 0;
  
  const multiplier = 2 / (period + 1);
  let ema = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

function analyzeVolume(data: any[]) {
  const recentVolume = data.slice(-5).map(d => d.volume);
  const avgVolume = data.slice(-20, -5).map(d => d.volume).reduce((a, b) => a + b, 0) / 15;
  const currentVolume = recentVolume[recentVolume.length - 1];
  
  const spike = currentVolume > avgVolume * 1.5;
  const trend = recentVolume[recentVolume.length - 1] > recentVolume[0] ? 'increasing' : 'decreasing';
  
  return { spike, trend, ratio: currentVolume / avgVolume };
}

function calculateFibonacciLevels(data: any[]) {
  const prices = data.map(d => d.close);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const range = high - low;
  
  return {
    level_0: high,
    level_236: high - (range * 0.236),
    level_382: high - (range * 0.382),
    level_500: high - (range * 0.500),
    level_618: high - (range * 0.618),
    level_786: high - (range * 0.786),
    level_100: low
  };
}

function findNearestFibLevel(price: number, fibLevels: any) {
  const levels = [
    { level: 0, price: fibLevels.level_0 },
    { level: 0.236, price: fibLevels.level_236 },
    { level: 0.382, price: fibLevels.level_382 },
    { level: 0.500, price: fibLevels.level_500 },
    { level: 0.618, price: fibLevels.level_618 },
    { level: 0.786, price: fibLevels.level_786 },
    { level: 1, price: fibLevels.level_100 }
  ];
  
  let nearest = levels[0];
  let minDistance = Math.abs(price - nearest.price);
  
  for (const level of levels) {
    const distance = Math.abs(price - level.price);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = level;
    }
  }
  
  return nearest;
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