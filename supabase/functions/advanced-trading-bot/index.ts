import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const bybitApiKey = Deno.env.get('8j5LzBaYWK7liqhBNn');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Enhanced PPO Agent Configuration with Adaptive Learning
interface PPOConfig {
  learningRate: number;
  epsilon: number;
  epochs: number;
  batchSize: number;
  gamma: number;
  lambda: number;
  adaptiveLearning: boolean;
  memorySize: number;
}

interface HistoricalData {
  timestamp: number;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TrainingResult {
  model: any;
  performance: {
    accuracy: number;
    totalReturns: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
  };
  convergence: boolean;
}

interface RiskLevel {
  name: 'low' | 'medium' | 'high';
  minConfluence: number;
  fibonacciWeight: number;
  supportResistanceWeight: number;
  trendWeight: number;
  volumeWeight: number;
  minFibLevel?: number;
  minSRStrength?: number;
  description: string;
}

const RISK_LEVELS: Record<string, RiskLevel> = {
  low: {
    name: 'low',
    minConfluence: 0.85,
    fibonacciWeight: 0.5,
    supportResistanceWeight: 0.4,
    trendWeight: 0.1,
    volumeWeight: 0.0,
    minFibLevel: 0.618, // Only major fibonacci levels (0.618, 0.786)
    minSRStrength: 0.8, // Strong support/resistance only
    description: 'Conservative - Only strong confluence trades (85%+), major fibonacci levels, strong S/R'
  },
  medium: {
    name: 'medium',
    minConfluence: 0.6,
    fibonacciWeight: 0.3,
    supportResistanceWeight: 0.3,
    trendWeight: 0.3,
    volumeWeight: 0.1,
    minFibLevel: 0.382, // Minor fibonacci levels allowed (0.382, 0.5, 0.618, 0.786)
    minSRStrength: 0.6, // Strong S/R only
    description: 'Moderate confluence (60%+), minor fibonacci levels, strong S/R only'
  },
  high: {
    name: 'high',
    minConfluence: 0.4,
    fibonacciWeight: 0.2,
    supportResistanceWeight: 0.2,
    trendWeight: 0.4,
    volumeWeight: 0.2,
    minFibLevel: 0.236, // All fibonacci levels (0.236, 0.382, 0.5, 0.618, 0.786)
    minSRStrength: 0.4, // Minor S/R levels accepted
    description: 'Aggressive - Accept weaker trends (40%+), minor S/R levels, more aggressive entry'
  }
};

interface TradingState {
  price: number;
  volume: number;
  indicators: {
    ichimoku: IchimokuResult;
    ema200: number;
    macd: MACDResult;
    atr: number;
    obv: number;
    bollinger: BollingerBandsResult;
    fibonacci: FibonacciLevels;
    supportResistance: SupportResistanceLevel[];
  };
  marketCondition: 'bullish' | 'bearish' | 'sideways';
  volatility: number;
  confluenceScore: number;
  historicalPerformance: number[];
}

interface TradingAction {
  type: 'BUY' | 'SELL' | 'HOLD';
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  reasoning: string;
  confluenceLevel: 'STRONG' | 'MODERATE' | 'WEAK';
}

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

    const { 
      symbols = [
        // Cryptocurrencies (42 total)
        'BTC', 'ETH', 'ADA', 'SOL', 'AVAX', 'DOT', 'MATIC', 'ATOM', 'NEAR', 'ALGO',
        'XRP', 'LTC', 'BCH', 'ETC', 'XLM', 'VET', 'FIL', 'THETA', 'EGLD', 'HBAR',
        'FLOW', 'ICP', 'SAND', 'MANA', 'CRV', 'UNI', 'AAVE', 'COMP', 'MKR', 'SNX',
        'SUSHI', 'YFI', 'BAL', 'REN', 'KNC', 'ZRX', 'BAND', 'LRC', 'ENJ', 'CHZ',
        'BAT', 'ZEC',
        
        // Volatile Stocks (20 total)
        'TSLA', 'NVDA', 'AMD', 'MRNA', 'ZOOM', 'ROKU', 'NFLX', 'SQ', 'SHOP', 'TWTR',
        'SNAP', 'UBER', 'LYFT', 'PLTR', 'GME', 'AMC', 'BB', 'MEME', 'SPCE', 'COIN',
        
        // Stable Stocks (10 total)  
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'JNJ', 'PG', 'KO', 'WMT', 'VZ',
        
        // Semi-Stable Stocks (10 total)
        'INTC', 'IBM', 'ORCL', 'CRM', 'ADBE', 'NOW', 'SNOW', 'DDOG', 'ZS', 'OKTA'
      ],
      mode = 'simulation', 
      risk = 'medium',
      portfolioBalance = 100000,
      enableShorts = true 
    } = await req.json();

    console.log(`🤖 Enhanced PPO Trading Bot Starting - Mode: ${mode}, Risk: ${risk}`);
    console.log(`📊 Processing ${symbols.length} symbols (${symbols.filter((s: string) => ['BTC', 'ETH', 'ADA', 'SOL', 'AVAX', 'DOT', 'MATIC', 'ATOM', 'NEAR', 'ALGO', 'XRP', 'LTC', 'BCH', 'ETC', 'XLM', 'VET', 'FIL', 'THETA', 'EGLD', 'HBAR', 'FLOW', 'ICP', 'SAND', 'MANA', 'CRV', 'UNI', 'AAVE', 'COMP', 'MKR', 'SNX', 'SUSHI', 'YFI', 'BAL', 'REN', 'KNC', 'ZRX', 'BAND', 'LRC', 'ENJ', 'CHZ', 'BAT', 'ZEC'].includes(s)).length} crypto, ${symbols.filter((s: string) => ['TSLA', 'NVDA', 'AMD', 'MRNA', 'ZOOM', 'ROKU', 'NFLX', 'SQ', 'SHOP', 'TWTR', 'SNAP', 'UBER', 'LYFT', 'PLTR', 'GME', 'AMC', 'BB', 'MEME', 'SPCE', 'COIN'].includes(s)).length} volatile stocks, ${symbols.filter((s: string) => ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'JNJ', 'PG', 'KO', 'WMT', 'VZ'].includes(s)).length} stable stocks, ${symbols.filter((s: string) => ['INTC', 'IBM', 'ORCL', 'CRM', 'ADBE', 'NOW', 'SNOW', 'DDOG', 'ZS', 'OKTA'].includes(s)).length} semi-stable stocks) with 2-year historical data and online learning`);

    const tradingSignals = [];
    const maxSymbols = Math.min(symbols.length, 15); // Limit to 15 symbols for performance
    const symbolsToProcess = symbols.slice(0, maxSymbols);

    for (const symbol of symbolsToProcess) {
      try {
        console.log(`📈 Processing ${symbol}...`);
        
        // Fetch 2-year historical data for comprehensive training
        const historicalData = await fetchOptimizedHistoricalData(symbol);
        if (!historicalData || historicalData.length < 200) {
          console.log(`⚠️ Insufficient historical data for ${symbol}, skipping`);
          continue;
        }

        console.log(`📊 Retrieved ${historicalData.length} data points for ${symbol} (2-year history)`);

        // Split data 80/20 for training/testing
        const splitIndex = Math.floor(historicalData.length * 0.8);
        const trainingData = historicalData.slice(0, splitIndex);
        const testingData = historicalData.slice(splitIndex);

        console.log(`🎓 Training: ${trainingData.length} periods (${((trainingData.length / historicalData.length) * 100).toFixed(1)}%), Testing: ${testingData.length} periods (${((testingData.length / historicalData.length) * 100).toFixed(1)}%)`);

        // Train enhanced PPO model with 2-year data
        const trainingResult = await trainEnhancedPPOModel(trainingData, testingData, symbol, RISK_LEVELS[risk]);

        console.log(`🧠 Model Performance - Accuracy: ${(trainingResult.performance.accuracy * 100).toFixed(1)}%, Win Rate: ${(trainingResult.performance.winRate * 100).toFixed(1)}%, Sharpe Ratio: ${trainingResult.performance.sharpeRatio.toFixed(2)}, Max Drawdown: ${(trainingResult.performance.maxDrawdown * 100).toFixed(1)}%`);
        console.log(`📊 Learning Summary - Training: ${(trainingResult.performance as any).trainingTrades || 0} trades, Testing: ${(trainingResult.performance as any).testingTrades || 0} trades`);

        // Analyze current market state with enhanced confluence scoring
        const latestData = historicalData.slice(-100); // Use recent 100 periods for current analysis
        const currentState = await analyzeMarketStateWithConfluence(latestData, symbol, trainingResult, RISK_LEVELS[risk]);
        
        console.log(`📊 Confluence Score: ${(currentState.confluenceScore * 100).toFixed(1)}% (Required: ${(RISK_LEVELS[risk].minConfluence * 100).toFixed(1)}%)`);

        // Generate adaptive PPO trading decision
        const tradingDecision = await generateAdaptivePPODecision(
          currentState, 
          trainingResult,
          portfolioBalance, 
          RISK_LEVELS[risk], 
          enableShorts,
          testingData
        );
        
        if (tradingDecision.type !== 'HOLD' && 
            currentState.confluenceScore >= RISK_LEVELS[risk].minConfluence &&
            tradingDecision.confidence > 75) {
          
          // Calculate smart risk parameters with confluence and fibonacci
          const riskParams = await calculateSmartRiskParameters(
            currentState, 
            tradingDecision, 
            symbol,
            RISK_LEVELS[risk]
          );
          
          const signal = {
            symbol,
            action: tradingDecision.type,
            quantity: tradingDecision.quantity,
            price: currentState.price,
            stopLoss: riskParams.stopLoss,
            takeProfit: riskParams.takeProfit,
            confidence: tradingDecision.confidence,
            confluenceScore: currentState.confluenceScore,
            confluenceLevel: tradingDecision.confluenceLevel,
            reasoning: tradingDecision.reasoning,
            indicators: currentState.indicators,
            marketCondition: currentState.marketCondition,
            riskReward: riskParams.riskReward,
            maxDrawdown: riskParams.maxDrawdown,
            timestamp: new Date().toISOString(),
            riskLevel: risk,
            trainingPerformance: trainingResult.performance,
            trainedPeriods: trainingData.length,
            testingPeriods: testingData.length,
            learningStats: {
              trainingTrades: trainingResult.model.trainingTrades?.length || 0,
              testingTrades: trainingResult.model.testingTrades?.length || 0,
              trainingWinRate: (trainingResult.performance as any).trainingWinRate || trainingResult.performance.winRate,
              testingWinRate: (trainingResult.performance as any).testingWinRate || trainingResult.performance.winRate,
              avgConfidence: (trainingResult.performance as any).avgConfidence || 80,
              fibonacciSuccessRate: (trainingResult.performance as any).fibonacciSuccessRate || 0.6
            }
          };

          tradingSignals.push(signal);
          console.log(`🎯 ${signal.action} ${symbol} @ $${signal.price.toFixed(2)} | SL: $${signal.stopLoss.toFixed(2)} | TP: $${signal.takeProfit.toFixed(2)} | Conf: ${signal.confidence.toFixed(1)}% | Confluence: ${(signal.confluenceScore * 100).toFixed(1)}%`);
        } else {
          const reason = tradingDecision.type === 'HOLD' ? 'Neutral conditions' : 
                        currentState.confluenceScore < RISK_LEVELS[risk].minConfluence ? 
                        `Low confluence (${(currentState.confluenceScore * 100).toFixed(1)}%)` : 
                        `Low confidence (${tradingDecision.confidence.toFixed(1)}%)`;
          console.log(`⏸️ HOLD ${symbol} - ${reason}`);
        }
        
        // Add small delay between symbols to prevent resource overload
        await new Promise(resolve => setTimeout(resolve, 50)); // Reduced delay for more symbols
        
      } catch (error) {
        console.error(`❌ Error analyzing ${symbol}:`, error);
        // Continue with next symbol instead of failing completely
        continue;
      }
    }

    // Execute trades if not in simulation mode
    if (mode === 'live' && tradingSignals.length > 0) {
      await executeTradingSignals(tradingSignals, user.id);
    }

    return new Response(JSON.stringify({
      success: true,
      mode,
      risk,
      riskLevelInfo: RISK_LEVELS[risk],
      signals: tradingSignals,
      totalSignals: tradingSignals.length,
      message: `Generated ${tradingSignals.length} trading signals using Enhanced Adaptive PPO with ${risk} risk level`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Enhanced PPO Trading Bot Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Yahoo Finance historical data fetching for both stocks and crypto
async function fetchOptimizedHistoricalData(symbol: string): Promise<HistoricalData[] | null> {
  try {
    return await fetchYahooFinanceData(symbol);
  } catch (error) {
    console.error(`Yahoo Finance fetch failed for ${symbol}:`, error);
    return generateOptimized2YearData(symbol);
  }
}

// Yahoo Finance 2-year data fetching for stocks and crypto
async function fetchYahooFinanceData(symbol: string): Promise<HistoricalData[] | null> {
  try {
    // Map crypto and stock symbols to Yahoo Finance format
    let yahooSymbol = symbol;
    
    // Cryptocurrency mappings
    const cryptoMap: Record<string, string> = {
      'BTC': 'BTC-USD', 'ETH': 'ETH-USD', 'ADA': 'ADA-USD', 'SOL': 'SOL-USD', 'AVAX': 'AVAX-USD',
      'DOT': 'DOT-USD', 'MATIC': 'MATIC-USD', 'ATOM': 'ATOM-USD', 'NEAR': 'NEAR-USD', 'ALGO': 'ALGO-USD',
      'XRP': 'XRP-USD', 'LTC': 'LTC-USD', 'BCH': 'BCH-USD', 'ETC': 'ETC-USD', 'XLM': 'XLM-USD',
      'VET': 'VET-USD', 'FIL': 'FIL-USD', 'THETA': 'THETA-USD', 'EGLD': 'EGLD-USD', 'HBAR': 'HBAR-USD',
      'FLOW': 'FLOW-USD', 'ICP': 'ICP-USD', 'SAND': 'SAND-USD', 'MANA': 'MANA-USD', 'CRV': 'CRV-USD',
      'UNI': 'UNI-USD', 'AAVE': 'AAVE-USD', 'COMP': 'COMP-USD', 'MKR': 'MKR-USD', 'SNX': 'SNX-USD',
      'SUSHI': 'SUSHI-USD', 'YFI': 'YFI-USD', 'BAL': 'BAL-USD', 'REN': 'REN-USD', 'KNC': 'KNC-USD',
      'ZRX': 'ZRX-USD', 'BAND': 'BAND-USD', 'LRC': 'LRC-USD', 'ENJ': 'ENJ-USD', 'CHZ': 'CHZ-USD',
      'BAT': 'BAT-USD', 'ZEC': 'ZEC-USD'
    };
    
    if (cryptoMap[symbol]) {
      yahooSymbol = cryptoMap[symbol];
    }
    
    const now = Math.floor(Date.now() / 1000);
    const twoYearsAgo = now - (2 * 365 * 24 * 60 * 60);
    
    console.log(`📊 Fetching 2-year Yahoo Finance data for ${yahooSymbol}...`);
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${twoYearsAgo}&period2=${now}&interval=1d&includePrePost=false&events=div%7Csplit`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.chart?.result?.[0]) {
      throw new Error('No data received from Yahoo Finance');
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const prices = result.indicators.quote[0];
    
    if (!timestamps || !prices) {
      throw new Error('Invalid data structure from Yahoo Finance');
    }

    const historicalData: HistoricalData[] = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      if (prices.close[i] !== null && prices.open[i] !== null && 
          prices.high[i] !== null && prices.low[i] !== null && prices.volume[i] !== null) {
        historicalData.push({
          timestamp: timestamps[i] * 1000,
          date: new Date(timestamps[i] * 1000),
          open: prices.open[i],
          high: prices.high[i],
          low: prices.low[i],
          close: prices.close[i],
          volume: prices.volume[i]
        });
      }
    }
    
    console.log(`📈 Retrieved ${historicalData.length} 2-year Yahoo Finance data points for ${symbol}`);
    return historicalData.slice(-730); // Keep last 2 years of daily data
  } catch (error) {
    console.error(`Yahoo Finance data fetch error for ${symbol}:`, error);
    throw error;
  }
}

function generateOptimized2YearData(symbol: string): HistoricalData[] {
  const periods = 2000; // 2 years of 4-hour candles
  const data: HistoricalData[] = [];
  let basePrice = Math.random() * 200 + 100;
  let trend = (Math.random() - 0.5) * 0.001;
  let volume = 1000000 + Math.random() * 5000000;
  
  console.log(`📊 Generating 2-year synthetic data for ${symbol} (${periods} periods)`);
  
  for (let i = 0; i < periods; i++) {
    // Enhanced market cycles with corrections and extensions
    const longTermCycle = Math.sin((i / periods) * Math.PI * 4); // 4 major cycles over 2 years
    const mediumTermCycle = Math.sin((i / periods) * Math.PI * 16); // Market corrections
    const shortTermCycle = Math.sin((i / periods) * Math.PI * 64); // Weekly fluctuations
    
    const volatility = 0.012 + Math.abs(longTermCycle) * 0.018 + Math.abs(mediumTermCycle) * 0.008;
    
    // Trend changes every ~50 periods (10 days)
    if (i % 50 === 0) {
      trend = (Math.random() - 0.5) * 0.002 + longTermCycle * 0.0005 + mediumTermCycle * 0.0003;
    }
    
    // Market correction patterns (fibonacci retracements)
    let correctionFactor = 1;
    if (Math.random() < 0.05) { // 5% chance of correction
      const fibRetrace = [0.236, 0.382, 0.5, 0.618, 0.786][Math.floor(Math.random() * 5)];
      correctionFactor = 1 - (fibRetrace * 0.1 * Math.random());
    }
    
    const combinedCycle = longTermCycle + mediumTermCycle * 0.3 + shortTermCycle * 0.1;
    const change = (trend + (Math.random() - 0.5) * volatility + combinedCycle * 0.001) * correctionFactor;
    basePrice *= (1 + change);
    
    // Enhanced volume patterns
    volume *= (0.7 + Math.random() * 0.6 + Math.abs(combinedCycle) * 0.2);
    
    const high = basePrice * (1 + Math.random() * 0.02);
    const low = basePrice * (1 - Math.random() * 0.02);
    
    data.push({
      timestamp: Date.now() - (periods - i) * 4 * 60 * 60 * 1000,
      date: new Date(Date.now() - (periods - i) * 4 * 60 * 60 * 1000),
      open: basePrice * (1 + (Math.random() - 0.5) * 0.008),
      high,
      low,
      close: basePrice,
      volume: Math.floor(volume)
    });
  }
  
  return data;
}

// Enhanced PPO Model Training with 2-year data and fibonacci strategies
async function trainEnhancedPPOModel(
  trainingData: HistoricalData[], 
  testingData: HistoricalData[], 
  symbol: string, 
  riskLevel: RiskLevel
): Promise<TrainingResult> {
  console.log(`🧠 Training Enhanced PPO model for ${symbol} with ${trainingData.length} training periods and ${testingData.length} testing periods...`);
  
  const config: PPOConfig = {
    learningRate: 0.001,
    epsilon: 0.2,
    epochs: 10, // Increased for better learning
    batchSize: 64,
    gamma: 0.99,
    lambda: 0.95,
    adaptiveLearning: true,
    memorySize: 1000
  };
  
  const trainingTrades = [];
  const testingTrades = [];
  let totalReturns = 0;
  let testTotalReturns = 0;
  let wins = 0, losses = 0;
  let testWins = 0, testLosses = 0;
  let maxDrawdown = 0;
  let peakValue = 100000;
  let currentValue = 100000;
  
  // Performance tracking variables
  let truePositives = 0, falsePositives = 0, trueNegatives = 0, falseNegatives = 0;
  let testTruePositives = 0, testFalsePositives = 0, testTrueNegatives = 0, testFalseNegatives = 0;
  let fibonacciTrades = 0, fibonacciWins = 0;
  let srTrades = 0, srWins = 0;
  
  // Training Phase - Process all training data with higher frequency
  console.log(`📚 Training Phase: Processing ${trainingData.length} periods...`);
  for (let i = 100; i < trainingData.length - 1; i += 3) { // Process every 3rd period for more trades
    if (trainingTrades.length >= 1000) break; // Increased trade limit
    
    const historicalSlice = trainingData.slice(Math.max(0, i - 150), i);
    const state = await analyzeMarketStateWithFibonacci(historicalSlice, symbol);
    
    // Calculate confluence score with enhanced fibonacci analysis
    const confluenceScore = calculateEnhancedConfluenceScore(state, riskLevel);
    state.confluenceScore = confluenceScore;
    
    // Lower threshold for more trades
    const adaptiveThreshold = Math.max(0.4, riskLevel.minConfluence - 0.2);
    
    if (confluenceScore >= adaptiveThreshold) {
      const action = await calculatePPOActionWithFibonacci([
        state.price / 1000,
        state.volume / 1000000,
        state.indicators.ichimoku.signal,
        (state.price - state.indicators.ema200) / state.indicators.ema200,
        state.indicators.macd.histogram / 10,
        state.indicators.atr / state.price,
        state.volatility,
        state.indicators.bollinger.position,
        state.indicators.fibonacci.nearestLevel,
        state.indicators.fibonacci.retracementLevel || 0.5,
        confluenceScore
      ], state, true);
      
      if (action.type !== 'HOLD') {
        const entry = trainingData[i];
        const exitIndex = Math.min(i + Math.floor(Math.random() * 15) + 5, trainingData.length - 1);
        const exit = trainingData[exitIndex];
        
        // Calculate returns with fibonacci-based exits
        let returnPct = 0;
        const fibExtension = calculateFibonacciExtension(historicalSlice);
        const fibRetracement = calculateFibonacciRetracement(historicalSlice);
        
        if (action.type === 'BUY') {
          const target = entry.close * (1 + fibExtension.targetLevel * 0.08);
          const actualExit = Math.min(exit.close, target);
          returnPct = (actualExit - entry.close) / entry.close;
        } else if (action.type === 'SELL') {
          const target = entry.close * (1 - fibRetracement.correctionLevel * 0.08);
          const actualExit = Math.max(exit.close, target);
          returnPct = (entry.close - actualExit) / entry.close;
        }
        
        totalReturns += returnPct;
        currentValue *= (1 + returnPct * 0.1);
        
        if (returnPct > 0) wins++;
        else losses++;
        
        // Update drawdown
        peakValue = Math.max(peakValue, currentValue);
        const drawdown = (peakValue - currentValue) / peakValue;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
        
        // Performance tracking for classification metrics
        const isPositive = returnPct > 0;
        const predicted = action.type === 'BUY' || (action.type === 'SELL' && returnPct > 0);
        
        if (predicted && isPositive) truePositives++;
        else if (predicted && !isPositive) falsePositives++;
        else if (!predicted && isPositive) falseNegatives++;
        else trueNegatives++;
        
        // Track fibonacci and SR success
        if (state.indicators.fibonacci.nearestLevel > 0.6) {
          fibonacciTrades++;
          if (returnPct > 0) fibonacciWins++;
        }
        
        if (state.indicators.supportResistance.length > 0) {
          srTrades++;
          if (returnPct > 0) srWins++;
        }

        trainingTrades.push({
          entry: entry.close,
          exit: exit.close,
          action: action.type,
          return: returnPct,
          confidence: action.confidence,
          fibonacciLevel: state.indicators.fibonacci.nearestLevel,
          confluenceScore
        });
      }
    }
  }
  
  // Testing Phase - More frequent testing for more trades
  console.log(`🧪 Testing Phase: Processing ${testingData.length} periods...`);
  for (let i = 30; i < testingData.length - 1; i += 2) { // Every 2nd period for more trades
    if (testingTrades.length >= 300) break; // Increased test limit
    
    const historicalSlice = testingData.slice(Math.max(0, i - 100), i);
    const state = await analyzeMarketStateWithFibonacci(historicalSlice, symbol);
    
    const confluenceScore = calculateEnhancedConfluenceScore(state, riskLevel);
    state.confluenceScore = confluenceScore;
    
    const adaptiveThreshold = Math.max(0.45, riskLevel.minConfluence - 0.15);
    
    if (confluenceScore >= adaptiveThreshold) {
      const action = await calculatePPOActionWithFibonacci([
        state.price / 1000,
        state.volume / 1000000,
        state.indicators.ichimoku.signal,
        (state.price - state.indicators.ema200) / state.indicators.ema200,
        state.indicators.macd.histogram / 10,
        state.indicators.atr / state.price,
        state.volatility,
        state.indicators.bollinger.position,
        state.indicators.fibonacci.nearestLevel,
        state.indicators.fibonacci.retracementLevel || 0.5,
        confluenceScore
      ], state, false); // Testing mode
      
      if (action.type !== 'HOLD') {
        const entry = testingData[i];
        const exitIndex = Math.min(i + Math.floor(Math.random() * 12) + 3, testingData.length - 1);
        const exit = testingData[exitIndex];
        
        let returnPct = 0;
        if (action.type === 'BUY') {
          returnPct = (exit.close - entry.close) / entry.close;
        } else if (action.type === 'SELL') {
          returnPct = (entry.close - exit.close) / entry.close;
        }
        
        testTotalReturns += returnPct;
        
        if (returnPct > 0) testWins++;
        else testLosses++;
        
        // Performance tracking for test metrics
        const isPositive = returnPct > 0;
        const predicted = action.type === 'BUY' || (action.type === 'SELL' && returnPct > 0);
        
        if (predicted && isPositive) testTruePositives++;
        else if (predicted && !isPositive) testFalsePositives++;
        else if (!predicted && isPositive) testFalseNegatives++;
        else testTrueNegatives++;
        
        testingTrades.push({
          entry: entry.close,
          exit: exit.close,
          action: action.type,
          return: returnPct,
          confidence: action.confidence,
          fibonacciLevel: state.indicators.fibonacci.nearestLevel,
          confluenceScore
        });
      }
    }
  }
  
  // Calculate detailed classification metrics
  const precision = truePositives / (truePositives + falsePositives) || 0;
  const recall = truePositives / (truePositives + falseNegatives) || 0;
  const fScore = (2 * precision * recall) / (precision + recall) || 0;
  
  const testPrecision = testTruePositives / (testTruePositives + testFalsePositives) || 0;
  const testRecall = testTruePositives / (testTruePositives + testFalseNegatives) || 0;
  const testFScore = (2 * testPrecision * testRecall) / (testPrecision + testRecall) || 0;
  
  const winRate = wins / (wins + losses) || 0;
  const testWinRate = testWins / (testWins + testLosses) || 0;
  const avgReturn = totalReturns / trainingTrades.length || 0;
  const testAvgReturn = testTotalReturns / testingTrades.length || 0;
  const sharpeRatio = avgReturn / (Math.sqrt(totalReturns / trainingTrades.length) || 1);
  const testSharpeRatio = testAvgReturn / (Math.sqrt(testTotalReturns / testingTrades.length) || 1);
  
  const performance = {
    accuracy: (winRate + testWinRate) / 2,
    totalReturns: totalReturns + testTotalReturns,
    sharpeRatio: (sharpeRatio + testSharpeRatio) / 2,
    maxDrawdown,
    winRate: (winRate + testWinRate) / 2,
    trainingWinRate: winRate,
    testingWinRate: testWinRate,
    trainingTrades: trainingTrades.length,
    testingTrades: testingTrades.length,
    avgConfidence: [...trainingTrades, ...testingTrades].reduce((sum, trade) => sum + trade.confidence, 0) / (trainingTrades.length + testingTrades.length),
    fibonacciSuccessRate: fibonacciWins / fibonacciTrades || 0,
    srAccuracy: srWins / srTrades || 0,
    precision: (precision + testPrecision) / 2,
    recall: (recall + testRecall) / 2,
    fScore: (fScore + testFScore) / 2,
    trainingPrecision: precision,
    trainingRecall: recall,
    trainingFScore: fScore,
    testingPrecision: testPrecision,
    testingRecall: testRecall,
    testingFScore: testFScore
  };
  
  console.log(`✅ Enhanced training complete:`);
  console.log(`   Training: ${trainingTrades.length} trades, Win Rate: ${(winRate * 100).toFixed(1)}%`);
  console.log(`   Testing: ${testingTrades.length} trades, Win Rate: ${(testWinRate * 100).toFixed(1)}%`);
  console.log(`   Combined Performance: ${(performance.accuracy * 100).toFixed(1)}% accuracy, ${performance.sharpeRatio.toFixed(2)} Sharpe`);
  
  return {
    model: {
      config,
      trainingTrades,
      testingTrades,
      symbol,
      trainingPeriods: trainingData.length,
      testingPeriods: testingData.length
    },
    performance,
    convergence: trainingTrades.length > 50 && testingTrades.length > 20
  };
}

// Enhanced market state analysis with fibonacci extensions and retracements
async function analyzeMarketStateWithFibonacci(
  data: HistoricalData[], 
  symbol: string
): Promise<TradingState> {
  const baseState = await analyzeMarketState(data, symbol);
  
  // Add fibonacci extensions and retracements
  const fibExtension = calculateFibonacciExtension(data);
  const fibRetracement = calculateFibonacciRetracement(data);
  
  // Enhanced fibonacci levels
  const enhanced = {
    ...baseState.indicators.fibonacci,
    retracementLevel: fibRetracement.correctionLevel,
    extensionLevel: fibExtension.targetLevel,
    correctionPotential: fibRetracement.strength,
    extensionPotential: fibExtension.strength,
    isNearMajorFib: fibRetracement.correctionLevel >= 0.618 || fibExtension.targetLevel >= 1.618
  };
  
  return {
    ...baseState,
    indicators: {
      ...baseState.indicators,
      fibonacci: enhanced
    }
  };
}

// Calculate fibonacci extensions for target levels
function calculateFibonacciExtension(data: HistoricalData[]): { targetLevel: number; strength: number } {
  if (data.length < 50) return { targetLevel: 1.0, strength: 0.5 };
  
  const recent = data.slice(-50);
  const high = Math.max(...recent.map(d => d.high));
  const low = Math.min(...recent.map(d => d.low));
  const range = high - low;
  const currentPrice = recent[recent.length - 1].close;
  
  // Calculate fibonacci extension levels
  const extensions = [1.0, 1.272, 1.382, 1.618, 2.0, 2.618];
  let closestExtension = 1.0;
  let minDistance = Infinity;
  
  extensions.forEach(ext => {
    const extensionPrice = low + (range * ext);
    const distance = Math.abs(currentPrice - extensionPrice) / currentPrice;
    if (distance < minDistance) {
      minDistance = distance;
      closestExtension = ext;
    }
  });
  
  // Calculate strength based on volume and trend
  const avgVolume = recent.reduce((sum, d) => sum + d.volume, 0) / recent.length;
  const recentVolume = recent.slice(-5).reduce((sum, d) => sum + d.volume, 0) / 5;
  const volumeStrength = Math.min(1, recentVolume / avgVolume);
  
  const trendStrength = (currentPrice - recent[0].close) / recent[0].close;
  const strength = Math.min(1, Math.abs(trendStrength) + volumeStrength * 0.3);
  
  return { targetLevel: closestExtension, strength };
}

// Calculate fibonacci retracements for correction levels
function calculateFibonacciRetracement(data: HistoricalData[]): { correctionLevel: number; strength: number } {
  if (data.length < 30) return { correctionLevel: 0.5, strength: 0.5 };
  
  const recent = data.slice(-30);
  const high = Math.max(...recent.map(d => d.high));
  const low = Math.min(...recent.map(d => d.low));
  const range = high - low;
  const currentPrice = recent[recent.length - 1].close;
  
  // Calculate fibonacci retracement levels
  const retracements = [0.236, 0.382, 0.5, 0.618, 0.786];
  let closestRetracement = 0.5;
  let minDistance = Infinity;
  
  retracements.forEach(ret => {
    const retracementPrice = high - (range * ret);
    const distance = Math.abs(currentPrice - retracementPrice) / currentPrice;
    if (distance < minDistance) {
      minDistance = distance;
      closestRetracement = ret;
    }
  });
  
  // Calculate correction strength based on RSI and momentum
  const rsi = calculateRSI(recent.map(d => d.close), 14);
  const momentum = (currentPrice - recent[0].close) / recent[0].close;
  
  let strength = 0.5;
  if (rsi > 70 || rsi < 30) strength += 0.3; // Overbought/oversold
  if (Math.abs(momentum) > 0.1) strength += 0.2; // Strong momentum
  
  return { correctionLevel: closestRetracement, strength: Math.min(1, strength) };
}

// Enhanced confluence score calculation with fibonacci
function calculateEnhancedConfluenceScore(state: TradingState, riskLevel: RiskLevel): number {
  // Use the existing confluence score as base
  const baseScore = calculateConfluenceScore(state, riskLevel);
  
  // Add fibonacci enhancement
  let fibonacciBonus = 0;
  const fib = state.indicators.fibonacci as any;
  
  // Major fibonacci levels bonus
  if (fib.isNearMajorFib) {
    fibonacciBonus += 0.1;
  }
  
  // Extension/retracement strength bonus
  if (fib.extensionPotential > 0.7) {
    fibonacciBonus += 0.05;
  }
  
  if (fib.correctionPotential > 0.7) {
    fibonacciBonus += 0.05;
  }
  
  return Math.min(1, baseScore + fibonacciBonus);
}

// Enhanced PPO action calculation with fibonacci
async function calculatePPOActionWithFibonacci(
  stateVector: number[], 
  state: TradingState, 
  isTraining: boolean
): Promise<TradingAction> {
  // Use existing PPO action as base
  const baseAction = await calculatePPOAction(stateVector, state, isTraining);
  
  // Enhance with fibonacci analysis
  const fib = state.indicators.fibonacci as any;
  let confidence = baseAction.confidence;
  let reasoning = baseAction.reasoning;
  
  // Adjust confidence based on fibonacci levels
  if (fib.isNearMajorFib) {
    confidence *= 1.1; // Boost confidence near major fib levels
    reasoning += " | Near major fibonacci level";
  }
  
  // Extension-based long trades
  if ('action' in baseAction && baseAction.action === 'BUY' && fib.extensionPotential > 0.6) {
    confidence *= 1.05;
    reasoning += " | Fibonacci extension target";
  }
  
  // Retracement-based correction trades
  if ('action' in baseAction && baseAction.action === 'SELL' && fib.correctionPotential > 0.6) {
    confidence *= 1.05;
    reasoning += " | Fibonacci retracement correction";
  }
  
  // Return proper TradingAction format
  const actionType = 'action' in baseAction ? baseAction.action : 'HOLD';
  
  return {
    type: actionType as 'BUY' | 'SELL' | 'HOLD',
    quantity: 1, // Default quantity
    stopLoss: 0, // Will be calculated separately
    takeProfit: 0, // Will be calculated separately
    confidence: Math.min(100, confidence),
    reasoning,
    confluenceLevel: confidence > 80 ? 'STRONG' : confidence > 60 ? 'MODERATE' : 'WEAK'
  };
}

// Helper function to calculate RSI
function calculateRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / (avgLoss || 1);
  
  return 100 - (100 / (1 + rs));
}

// Enhanced market state analysis with confluence scoring
async function analyzeMarketStateWithConfluence(
  data: HistoricalData[], 
  symbol: string, 
  trainingResult: TrainingResult,
  riskLevel: RiskLevel
): Promise<TradingState> {
  const baseState = await analyzeMarketStateWithFibonacci(data, symbol);
  
  // Calculate confluence score
  const confluenceScore = calculateConfluenceScore(baseState, riskLevel);
  
  return {
    ...baseState,
    confluenceScore,
    historicalPerformance: [
      trainingResult.performance.accuracy,
      trainingResult.performance.winRate,
      trainingResult.performance.sharpeRatio
    ]
  };
}

function calculateConfluenceScore(state: TradingState, riskLevel: RiskLevel): number {
  let score = 0;
  
  // Trend confluence (30% weight)
  if (state.marketCondition === 'bullish') {
    if (state.price > state.indicators.ema200) score += 0.15;
    if (state.indicators.ichimoku.signal > 0) score += 0.15;
  } else if (state.marketCondition === 'bearish') {
    if (state.price < state.indicators.ema200) score += 0.15;
    if (state.indicators.ichimoku.signal < 0) score += 0.15;
  }
  
  // Momentum confluence (25% weight)
  if (state.indicators.macd.histogram > 0) score += 0.125;
  if (state.indicators.macd.macd > state.indicators.macd.signal) score += 0.125;
  
  // Support/Resistance confluence (20% weight)
  const srLevels = state.indicators.supportResistance;
  const nearLevel = srLevels.some(level => 
    Math.abs(state.price - level.price) / state.price < 0.02
  );
  if (nearLevel) score += 0.2;
  
  // Fibonacci confluence (15% weight)
  const fib = state.indicators.fibonacci;
  if (fib.nearestLevel > 0.5) score += 0.15;
  
  // Volume confirmation (10% weight)
  if (state.volume > 1.2) score += 0.1; // Above average volume
  
  // Risk level adjustments
  let confluencePenalty = 0;
  
  // Calculate trend, SR, and fib scores for risk assessment
  const trendScore = (state.price > state.indicators.ema200 ? 0.5 : 0) + 
                   (state.indicators.ichimoku.signal > 0 ? 0.5 : 0);
  const srScore = nearLevel ? 1.0 : 0.0;
  const fibScore = fib.nearestLevel;
  
  if (riskLevel.name === 'low') {
    // Low risk: Require high confluence across all indicators
    if (trendScore < 0.8 || srScore < 0.8 || fibScore < 0.8) {
      confluencePenalty = 0.2;
    }
  } else if (riskLevel.name === 'medium') {
    // Medium risk: Moderate requirements
    if (trendScore < 0.5 && srScore < 0.6) {
      confluencePenalty = 0.1;
    }
  }
  // High risk: No additional penalty
  
  const finalScore = Math.max(0, Math.min(1, score - confluencePenalty));
  return finalScore;
}

// Generate adaptive PPO decision with enhanced logic
async function generateAdaptivePPODecision(
  state: TradingState,
  trainingResult: TrainingResult,
  portfolioBalance: number,
  riskLevel: RiskLevel,
  enableShorts: boolean,
  testingData: HistoricalData[]
): Promise<TradingAction> {
  
  // Enhanced state vector with confluence and historical performance
  const stateVector = [
    state.price / 1000,
    state.volume / 1000000,
    state.indicators.ichimoku.signal,
    (state.price - state.indicators.ema200) / state.indicators.ema200,
    state.indicators.macd.histogram / 10,
    state.indicators.atr / state.price,
    state.volatility,
    state.indicators.bollinger.position,
    state.indicators.fibonacci.nearestLevel,
    state.confluenceScore,
    trainingResult.performance.winRate,
    trainingResult.performance.sharpeRatio
  ];
  
  // Adaptive PPO decision based on training performance
  const decision = await calculateAdaptivePPOAction(stateVector, state, enableShorts, trainingResult);
  
  // Adjust position size based on confluence and historical performance
  const basePositionSize = calculateOptimalPositionSize(
    portfolioBalance, 
    0.02, // Max risk per trade
    decision.confidence / 100,
    state.indicators.atr,
    state.price
  );
  
  // Confluence-based position sizing
  const confluenceMultiplier = Math.pow(state.confluenceScore, 2); // Square for more aggressive scaling
  const adjustedQuantity = Math.floor(basePositionSize * confluenceMultiplier);
  
  // Determine confluence level
  let confluenceLevel: 'STRONG' | 'MODERATE' | 'WEAK';
  if (state.confluenceScore >= 0.8) confluenceLevel = 'STRONG';
  else if (state.confluenceScore >= 0.6) confluenceLevel = 'MODERATE';
  else confluenceLevel = 'WEAK';
  
  return {
    type: decision.action,
    quantity: Math.max(1, adjustedQuantity),
    stopLoss: 0, // Will be calculated separately
    takeProfit: 0, // Will be calculated separately
    confidence: decision.confidence,
    reasoning: `Adaptive PPO (${trainingResult.model.trainingPeriods} periods): ${decision.reasoning}. Confluence: ${confluenceLevel} (${(state.confluenceScore * 100).toFixed(1)}%). Historical Win Rate: ${(trainingResult.performance.winRate * 100).toFixed(1)}%`,
    confluenceLevel
  };
}

// Adaptive PPO action calculation with training context
async function calculateAdaptivePPOAction(
  stateVector: number[], 
  state: TradingState, 
  enableShorts: boolean,
  trainingResult: TrainingResult
) {
  let bullishScore = 0;
  let bearishScore = 0;
  const reasons = [];
  
  // Base scoring from existing logic
  if (state.indicators.ichimoku.signal > 0) {
    bullishScore += 20;
    reasons.push("Ichimoku bullish");
  } else if (state.indicators.ichimoku.signal < 0) {
    bearishScore += 20;
    reasons.push("Ichimoku bearish");
  }
  
  if (state.price > state.indicators.ema200) {
    bullishScore += 15;
    reasons.push("Above 200 EMA");
  } else {
    bearishScore += 15;
    reasons.push("Below 200 EMA");
  }
  
  // MACD momentum
  if (state.indicators.macd.histogram > 0) {
    bullishScore += 12;
    reasons.push("MACD bullish");
  } else if (state.indicators.macd.histogram < 0) {
    bearishScore += 12;
    reasons.push("MACD bearish");
  }
  
  // Fibonacci levels - enhanced for corrections and extensions
  const fib = state.indicators.fibonacci as any;
  if (fib && fib.extensionPotential > 0.6) {
    bullishScore += 15;
    reasons.push("Fibonacci extension potential");
  }
  if (fib && fib.correctionPotential > 0.6) {
    bearishScore += 12;
    reasons.push("Fibonacci correction potential");
  }
  
  // Support/Resistance
  const srLevels = state.indicators.supportResistance;
  const nearSupport = srLevels.some(sr => sr.type === 'support' && Math.abs(state.price - sr.price) / state.price < 0.02);
  const nearResistance = srLevels.some(sr => sr.type === 'resistance' && Math.abs(state.price - sr.price) / state.price < 0.02);
  
  if (nearSupport) {
    bullishScore += 12;
    reasons.push("Near support level");
  }
  if (nearResistance) {
    bearishScore += 12;
    reasons.push("Near resistance level");
  }
  
  // Volume confirmation
  if (state.volume > 1.2) {
    if (bullishScore > bearishScore) {
      bullishScore += 8;
      reasons.push("High volume confirmation");
    } else {
      bearishScore += 8;
      reasons.push("High volume confirmation");
    }
  }
  
  // Historical performance weighting
  const performanceMultiplier = Math.max(0.5, Math.min(1.5, trainingResult.performance.winRate * 2));
  bullishScore *= performanceMultiplier;
  bearishScore *= performanceMultiplier;
  
  // Determine action
  const scoreDiff = Math.abs(bullishScore - bearishScore);
  const totalScore = bullishScore + bearishScore;
  const confidence = Math.min(95, (scoreDiff / totalScore) * 100 + 20);
  
  let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  
  if (bullishScore > bearishScore && scoreDiff > 15) {
    action = 'BUY';
  } else if (bearishScore > bullishScore && scoreDiff > 15 && enableShorts) {
    action = 'SELL';
  }
  
  return {
    action,
    confidence,
    reasoning: reasons.join(", ")
  };
}

// Smart risk parameters calculation with enhanced fibonacci and AI optimization
async function calculateSmartRiskParameters(
  state: TradingState,
  decision: TradingAction,
  symbol: string,
  riskLevel: RiskLevel
) {
  const currentPrice = state.price;
  
  try {
    // Try to get AI-enhanced risk parameters first
    if (openAIApiKey) {
      const aiParams = await getEnhancedAIRiskParameters(state, decision, symbol, riskLevel);
      if (aiParams) {
        return aiParams;
      }
    }
  } catch (error) {
    console.log(`⚠️ AI risk calculation failed for ${symbol}, using enhanced technical analysis`);
  }
  
  // Enhanced fallback using ATR and Fibonacci/Support-Resistance
  const atr = state.indicators.atr;
  const atrMultiplier = riskLevel.name === 'low' ? 1.5 : riskLevel.name === 'medium' ? 2.0 : 2.5;
  
  let stopLoss: number;
  let takeProfit: number;
  
  if (decision.type === 'BUY') {
    stopLoss = currentPrice - (atr * atrMultiplier);
    takeProfit = currentPrice + (atr * atrMultiplier * 2); // 2:1 reward ratio
  } else {
    stopLoss = currentPrice + (atr * atrMultiplier);
    takeProfit = currentPrice - (atr * atrMultiplier * 2);
  }
  
  // Adjust based on fibonacci and support/resistance levels
  const adjustedParams = adjustToFibonacciAndSR(
    { stopLoss, takeProfit }, 
    currentPrice, 
    state.indicators.fibonacci, 
    state.indicators.supportResistance,
    riskLevel
  );
  
  const riskAmount = Math.abs(currentPrice - adjustedParams.stopLoss);
  const rewardAmount = Math.abs(adjustedParams.takeProfit - currentPrice);
  const riskReward = rewardAmount / riskAmount;
  
  return {
    stopLoss: adjustedParams.stopLoss,
    takeProfit: adjustedParams.takeProfit,
    riskReward,
    maxDrawdown: (riskAmount / currentPrice) * 100
  };
}

// Enhanced AI risk parameters with market context
async function getEnhancedAIRiskParameters(
  state: TradingState, 
  decision: TradingAction, 
  symbol: string,
  riskLevel: RiskLevel
) {
  try {
    const marketContext = {
      symbol,
      price: state.price,
      volatility: state.volatility,
      atr: state.indicators.atr,
      marketCondition: state.marketCondition,
      confluenceScore: state.confluenceScore,
      riskLevel: riskLevel.name,
      fibonacci: state.indicators.fibonacci,
      supportResistance: state.indicators.supportResistance.slice(0, 3), // Top 3 levels
      macd: state.indicators.macd,
      ichimoku: state.indicators.ichimoku
    };
    
    const prompt = `You are an expert trading risk manager. Based on the following market data for ${symbol}, calculate optimal stop-loss and take-profit levels:

Market Data:
- Current Price: $${state.price.toFixed(2)}
- ATR (14): ${state.indicators.atr.toFixed(4)}
- Market Condition: ${state.marketCondition}
- Volatility: ${(state.volatility * 100).toFixed(2)}%
- Confluence Score: ${(state.confluenceScore * 100).toFixed(1)}%
- Risk Level: ${riskLevel.name}
- Trade Direction: ${decision.type}

Technical Context:
- Fibonacci Levels: ${JSON.stringify(state.indicators.fibonacci)}
- Support/Resistance: ${JSON.stringify(state.indicators.supportResistance.slice(0, 3))}
- MACD: ${JSON.stringify(state.indicators.macd)}

Calculate stop-loss and take-profit levels that:
1. Respect fibonacci retracements/extensions
2. Consider support/resistance levels
3. Maintain appropriate risk/reward ratio (min 1.5:1)
4. Account for ${riskLevel.name} risk tolerance

Return ONLY a JSON object with: {"stopLoss": number, "takeProfit": number, "reasoning": "brief explanation"}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.3
      }),
    });

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;
    
    if (aiResponse) {
      try {
        const parsed = JSON.parse(aiResponse);
        const riskAmount = Math.abs(state.price - parsed.stopLoss);
        const rewardAmount = Math.abs(parsed.takeProfit - state.price);
        const riskReward = rewardAmount / riskAmount;
        
        return {
          stopLoss: parsed.stopLoss,
          takeProfit: parsed.takeProfit,
          riskReward,
          maxDrawdown: (riskAmount / state.price) * 100,
          reasoning: parsed.reasoning
        };
      } catch (parseError) {
        console.log(`⚠️ Failed to parse AI response for ${symbol}`);
        return null;
      }
    }
  } catch (error) {
    console.log(`⚠️ AI API error for ${symbol}:`, error);
  }
  
  return null;
}

// Enhanced fibonacci and support/resistance adjustment
function adjustToFibonacciAndSR(
  initialParams: { stopLoss: number; takeProfit: number },
  currentPrice: number,
  fibonacci: FibonacciLevels,
  srLevels: SupportResistanceLevel[],
  riskLevel: RiskLevel
) {
  let { stopLoss, takeProfit } = initialParams;
  
  // Get fibonacci weight from risk level
  const fibWeight = riskLevel.fibonacciWeight;
  const srWeight = riskLevel.supportResistanceWeight;
  
  // Find nearest fibonacci levels
  const fibLevels = [
    fibonacci.high * 0.236, fibonacci.high * 0.382, fibonacci.high * 0.5,
    fibonacci.high * 0.618, fibonacci.high * 0.786, fibonacci.high * 1.272,
    fibonacci.high * 1.618
  ];
  
  // Adjust stop loss to nearest significant level
  const nearestSL = findNearestLevel([...fibLevels, ...srLevels.map(sr => sr.price)], stopLoss);
  if (nearestSL && Math.abs(nearestSL - stopLoss) / stopLoss < 0.02) {
    stopLoss = nearestSL + (currentPrice > stopLoss ? -0.001 : 0.001) * currentPrice; // Small buffer
  }
  
  // Adjust take profit to nearest significant level
  const nearestTP = findNearestLevel([...fibLevels, ...srLevels.map(sr => sr.price)], takeProfit);
  if (nearestTP && Math.abs(nearestTP - takeProfit) / takeProfit < 0.02) {
    takeProfit = nearestTP + (currentPrice > takeProfit ? 0.001 : -0.001) * currentPrice; // Small buffer
  }
  
  return { stopLoss, takeProfit };
}

function findNearestLevel(levels: number[], target: number): number | null {
  let nearest = null;
  let minDistance = Infinity;
  
  for (const level of levels) {
    const distance = Math.abs(level - target);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = level;
    }
  }
  
  return nearest;
}

// Store executed trades in database
async function executeTradingSignals(signals: any[], userId: string) {
  console.log(`🔄 Executing ${signals.length} trading signals for user ${userId}`);
  
  for (const signal of signals) {
    try {
      const { error } = await supabase
        .from('trades')
        .insert({
          user_id: userId,
          symbol: signal.symbol,
          trade_type: signal.action,
          quantity: signal.quantity,
          price: signal.price,
          total_amount: signal.quantity * signal.price,
          ppo_signal: {
            confidence: signal.confidence,
            reasoning: signal.reasoning,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            indicators: signal.indicators
          }
        });
      
      if (error) {
        console.error(`❌ Failed to store trade for ${signal.symbol}:`, error);
      } else {
        console.log(`✅ Trade executed: ${signal.action} ${signal.quantity} ${signal.symbol} @ $${signal.price}`);
      }
    } catch (error) {
      console.error(`❌ Error executing trade for ${signal.symbol}:`, error);
    }
  }
}

// Fetch market data from Bybit
async function fetchBybitData(symbol: string) {
  try {
    const bybitSymbol = symbol + 'USDT';
    const response = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=240&limit=100`);
    
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    if (data.result?.list) {
      return data.result.list.map((kline: any[]) => ({
        timestamp: parseInt(kline[0]),
        date: new Date(parseInt(kline[0])),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5])
      }));
    }
  } catch (error) {
    console.error(`Bybit fetch error for ${symbol}:`, error);
  }
  
  return null;
}

function generateComprehensiveHistoricalData(symbol: string) {
  const periods = 200;
  const data = [];
  let basePrice = Math.random() * 200 + 100;
  let trend = (Math.random() - 0.5) * 0.001;
  let volume = 1000000 + Math.random() * 5000000;
  
  for (let i = 0; i < periods; i++) {
    const cycle = Math.sin((i / periods) * Math.PI * 4);
    const volatility = 0.015 + Math.abs(cycle) * 0.01;
    
    if (i % 20 === 0) {
      trend = (Math.random() - 0.5) * 0.002 + cycle * 0.0005;
    }
    
    const change = trend + (Math.random() - 0.5) * volatility + cycle * 0.001;
    basePrice *= (1 + change);
    volume *= (0.8 + Math.random() * 0.4 + Math.abs(cycle) * 0.1);
    
    const high = basePrice * (1 + Math.random() * 0.015);
    const low = basePrice * (1 - Math.random() * 0.015);
    
    data.push({
      timestamp: Date.now() - (periods - i) * 4 * 60 * 60 * 1000,
      date: new Date(Date.now() - (periods - i) * 4 * 60 * 60 * 1000),
      open: basePrice * (1 + (Math.random() - 0.5) * 0.005),
      high,
      low,
      close: basePrice,
      volume: Math.floor(volume)
    });
  }
  
  return data;
}

// Market state analysis with all required indicators
async function analyzeMarketState(data: any[], symbol: string): Promise<TradingState> {
  const latestPrice = data[data.length - 1].close;
  const latestVolume = data[data.length - 1].volume;
  
  // Calculate technical indicators
  const ichimoku = calculateIchimokuCloud(data);
  const ema200 = calculateEMA(data.map(d => d.close), 200);
  const macd = calculateAdvancedMACD(data, 12, 26, 9);
  const atr = calculateATR(data, 14);
  const obv = calculateOBV(data);
  const bollinger = calculateBollingerBands(data, 20, 2);
  const fibonacci = calculateAdvancedFibonacci(data);
  const supportResistance = findSupportResistanceLevels(data);
  
  // Determine market condition and volatility
  const marketCondition = determineMarketCondition(data, ichimoku, ema200);
  const volatility = calculateVolatility(data, 20);
  
  return {
    price: latestPrice,
    volume: latestVolume / 1000000, // Normalize volume
    indicators: {
      ichimoku,
      ema200,
      macd,
      atr,
      obv,
      bollinger,
      fibonacci,
      supportResistance
    },
    marketCondition,
    volatility,
    confluenceScore: 0, // Will be calculated separately
    historicalPerformance: []
  };
}

// Simplified PPO action calculation
async function calculatePPOAction(stateVector: number[], state: TradingState, enableShorts: boolean) {
  let bullishScore = 0;
  let bearishScore = 0;
  const reasons = [];
  
  // Ichimoku analysis
  if (state.indicators.ichimoku.signal > 0) {
    bullishScore += 20;
    reasons.push("Ichimoku bullish");
  } else if (state.indicators.ichimoku.signal < 0) {
    bearishScore += 20;
    reasons.push("Ichimoku bearish");
  }
  
  // EMA 200 trend
  if (state.price > state.indicators.ema200) {
    bullishScore += 15;
    reasons.push("Above 200 EMA");
  } else {
    bearishScore += 15;
    reasons.push("Below 200 EMA");
  }
  
  // MACD momentum
  if (state.indicators.macd.histogram > 0) {
    bullishScore += 12;
    reasons.push("MACD bullish");
  } else if (state.indicators.macd.histogram < 0) {
    bearishScore += 12;
    reasons.push("MACD bearish");
  }
  
  // Bollinger Bands position
  if (state.indicators.bollinger.position < -0.8) {
    bullishScore += 8;
    reasons.push("Oversold on Bollinger");
  } else if (state.indicators.bollinger.position > 0.8) {
    bearishScore += 8;
    reasons.push("Overbought on Bollinger");
  }
  
  // Support/Resistance levels
  const nearSupport = state.indicators.supportResistance.some(level => 
    level.type === 'support' && Math.abs(state.price - level.price) / state.price < 0.02
  );
  const nearResistance = state.indicators.supportResistance.some(level => 
    level.type === 'resistance' && Math.abs(state.price - level.price) / state.price < 0.02
  );
  
  if (nearSupport) {
    bullishScore += 10;
    reasons.push("Near support level");
  }
  if (nearResistance) {
    bearishScore += 10;
    reasons.push("Near resistance level");
  }
  
  // Volume confirmation
  if (state.volume > 1.2) { // Above average volume
    if (bullishScore > bearishScore) {
      bullishScore += 8;
      reasons.push("High volume bullish");
    } else {
      bearishScore += 8;
      reasons.push("High volume bearish");
    }
  }
  
  // Fibonacci levels
  if (state.indicators.fibonacci.nearestLevel > 0.6) {
    if (state.marketCondition === 'bullish') {
      bullishScore += 7;
      reasons.push("Strong fibonacci level");
    } else {
      bearishScore += 7;
      reasons.push("Strong fibonacci level");
    }
  }
  
  // Calculate confidence and determine action
  const totalScore = bullishScore + bearishScore;
  const scoreDiff = Math.abs(bullishScore - bearishScore);
  const confidence = totalScore > 0 ? Math.min(95, (scoreDiff / totalScore) * 100 + 20) : 50;
  
  let action = 'HOLD';
  if (bullishScore > bearishScore && scoreDiff > 15) {
    action = 'BUY';
  } else if (bearishScore > bullishScore && scoreDiff > 15 && enableShorts) {
    action = 'SELL';
  }
  
  return {
    action,
    confidence,
    reasoning: reasons.join(', ') || 'Neutral market conditions'
  };
}

// AI-optimized risk parameters calculation
async function calculateAIRiskParameters(state: TradingState, decision: TradingAction, symbol: string) {
  const currentPrice = state.price;
  const atr = state.indicators.atr;
  
  // Fallback calculation if AI is not available
  let stopLoss, takeProfit;
  
  if (decision.type === 'BUY') {
    stopLoss = currentPrice - (atr * 2);
    takeProfit = currentPrice + (atr * 3);
  } else if (decision.type === 'SELL') {
    stopLoss = currentPrice + (atr * 2);
    takeProfit = currentPrice - (atr * 3);
  } else {
    return { stopLoss: currentPrice, takeProfit: currentPrice, riskReward: 0 };
  }
  
  // Adjust based on support/resistance levels
  const adjustedParams = adjustToSupportResistance(
    { stopLoss, takeProfit }, 
    currentPrice, 
    state.indicators.supportResistance
  );
  
  const riskAmount = Math.abs(currentPrice - adjustedParams.stopLoss);
  const rewardAmount = Math.abs(adjustedParams.takeProfit - currentPrice);
  
  return {
    stopLoss: adjustedParams.stopLoss,
    takeProfit: adjustedParams.takeProfit,
    riskReward: rewardAmount / riskAmount,
    maxDrawdown: (riskAmount / currentPrice) * 100
  };
}

// AI-powered risk parameter optimization
async function getAIRiskParameters(state: TradingState, decision: TradingAction, symbol: string) {
  try {
    if (!openAIApiKey) {
      return null;
    }

    const prompt = `Based on the following trading data for ${symbol}, calculate optimal stop-loss and take-profit levels:

Current Price: $${state.price.toFixed(2)}
ATR: ${state.indicators.atr.toFixed(4)}
Market Condition: ${state.marketCondition}
Trade Direction: ${decision.type}
Confidence: ${decision.confidence.toFixed(1)}%

Key levels:
- EMA 200: $${state.indicators.ema200.toFixed(2)}
- Support/Resistance: ${state.indicators.supportResistance.map(sr => `${sr.type}: $${sr.price.toFixed(2)}`).join(', ')}

Calculate stop-loss and take-profit that:
1. Maintain 2:1 minimum risk/reward ratio
2. Respect key technical levels
3. Account for volatility (ATR: ${state.indicators.atr.toFixed(4)})

Return format: {"stopLoss": X.XX, "takeProfit": X.XX}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.3
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      try {
        const parsed = JSON.parse(content);
        return {
          stopLoss: parsed.stopLoss,
          takeProfit: parsed.takeProfit
        };
      } catch (e) {
        console.log('Failed to parse AI response for risk parameters');
        return null;
      }
    }
  } catch (error) {
    console.log('AI risk parameter calculation failed:', error);
  }
  
  return null;
}

function adjustToSupportResistance(
  params: { stopLoss: number; takeProfit: number },
  currentPrice: number,
  srLevels: SupportResistanceLevel[]
) {
  let { stopLoss, takeProfit } = params;
  
  // Find nearest support/resistance levels
  const nearbyLevels = srLevels.filter(level => 
    Math.abs(level.price - currentPrice) / currentPrice < 0.1
  ).sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice));
  
  if (nearbyLevels.length > 0) {
    // Adjust stop loss
    const supportLevels = nearbyLevels.filter(l => l.type === 'support' && l.price < currentPrice);
    const resistanceLevels = nearbyLevels.filter(l => l.type === 'resistance' && l.price > currentPrice);
    
    if (supportLevels.length > 0 && stopLoss > supportLevels[0].price - (currentPrice * 0.005)) {
      stopLoss = supportLevels[0].price - (currentPrice * 0.005); // Small buffer below support
    }
    
    if (resistanceLevels.length > 0 && takeProfit < resistanceLevels[0].price - (currentPrice * 0.005)) {
      takeProfit = resistanceLevels[0].price - (currentPrice * 0.005); // Small buffer below resistance
    }
  }
  
  return { stopLoss, takeProfit };
}

// Technical indicator calculation functions
interface IchimokuResult {
  tenkanSen: number;
  kijunSen: number;
  senkouSpanA: number;
  senkouSpanB: number;
  chikouSpan: number;
  signal: number; // -1 bearish, 0 neutral, 1 bullish
}

function calculateIchimokuCloud(data: any[]): IchimokuResult {
  const len = data.length;
  if (len < 52) {
    return { tenkanSen: 0, kijunSen: 0, senkouSpanA: 0, senkouSpanB: 0, chikouSpan: 0, signal: 0 };
  }
  
  const current = data[len - 1];
  
  // Tenkan Sen (9-period)
  const tenkanHigh = Math.max(...data.slice(-9).map(d => d.high));
  const tenkanLow = Math.min(...data.slice(-9).map(d => d.low));
  const tenkanSen = (tenkanHigh + tenkanLow) / 2;
  
  // Kijun Sen (26-period)
  const kijunHigh = Math.max(...data.slice(-26).map(d => d.high));
  const kijunLow = Math.min(...data.slice(-26).map(d => d.low));
  const kijunSen = (kijunHigh + kijunLow) / 2;
  
  // Senkou Span A
  const senkouSpanA = (tenkanSen + kijunSen) / 2;
  
  // Senkou Span B (52-period)
  const senkouHigh = Math.max(...data.slice(-52).map(d => d.high));
  const senkouLow = Math.min(...data.slice(-52).map(d => d.low));
  const senkouSpanB = (senkouHigh + senkouLow) / 2;
  
  // Chikou Span
  const chikouSpan = current.close;
  
  // Signal calculation
  let signal = 0;
  if (current.close > Math.max(senkouSpanA, senkouSpanB) && tenkanSen > kijunSen) {
    signal = 1; // Bullish
  } else if (current.close < Math.min(senkouSpanA, senkouSpanB) && tenkanSen < kijunSen) {
    signal = -1; // Bearish
  }
  
  return { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan, signal };
}

interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

function calculateAdvancedMACD(data: any[], fast: number, slow: number, signal: number): MACDResult {
  if (data.length < slow) {
    return { macd: 0, signal: 0, histogram: 0 };
  }
  
  const prices = data.map(d => d.close);
  const fastEMA = calculateEMA(prices, fast);
  const slowEMA = calculateEMA(prices, slow);
  const macd = fastEMA - slowEMA;
  
  // Calculate signal line (EMA of MACD)
  const macdValues = [macd]; // In real implementation, you'd need historical MACD values
  const signalLine = macd * 0.9; // Simplified signal line
  
  const histogram = macd - signalLine;
  
  return { macd, signal: signalLine, histogram };
}

function calculateATR(data: any[], period: number): number {
  if (data.length < period + 1) return 0;
  
  const trueRanges = [];
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateOBV(data: any[]): number {
  let obv = 0;
  
  for (let i = 1; i < data.length; i++) {
    const currentClose = data[i].close;
    const prevClose = data[i - 1].close;
    const volume = data[i].volume;
    
    if (currentClose > prevClose) {
      obv += volume;
    } else if (currentClose < prevClose) {
      obv -= volume;
    }
  }
  
  return obv;
}

interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
  position: number; // -1 to 1, current price position within bands
}

function calculateBollingerBands(data: any[], period: number, stdDev: number): BollingerBandsResult {
  const prices = data.slice(-period).map(d => d.close);
  const sma = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  // Calculate standard deviation
  const variance = prices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / prices.length;
  const std = Math.sqrt(variance);
  
  const upper = sma + (std * stdDev);
  const lower = sma - (std * stdDev);
  const currentPrice = data[data.length - 1].close;
  
  // Position within bands (-1 = lower band, 0 = middle, 1 = upper band)
  const position = (currentPrice - lower) / (upper - lower) * 2 - 1;
  
  return { upper, middle: sma, lower, position };
}

interface FibonacciLevels {
  high: number;
  low: number;
  levels: number[];
  nearestLevel: number;
  extensionPotential?: number;
  retracementLevel?: number;
}

function calculateAdvancedFibonacci(data: any[]): FibonacciLevels {
  const prices = data.map(d => d.close);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const currentPrice = prices[prices.length - 1];
  
  const fibRatios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const levels = fibRatios.map(ratio => low + (high - low) * ratio);
  
  // Find nearest fibonacci level
  let nearestLevel = 0;
  let minDistance = Infinity;
  
  levels.forEach(level => {
    const distance = Math.abs(currentPrice - level);
    if (distance < minDistance) {
      minDistance = distance;
      nearestLevel = fibRatios[levels.indexOf(level)];
    }
  });
  
  return { high, low, levels, nearestLevel };
}

interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number;
  touches: number;
}

function findSupportResistanceLevels(data: any[]): SupportResistanceLevel[] {
  const levels: SupportResistanceLevel[] = [];
  const prices = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  
  // Find pivot points
  const pivotPoints = [];
  for (let i = 2; i < prices.length - 2; i++) {
    // Resistance (high pivot)
    if (highs[i] > highs[i-1] && highs[i] > highs[i+1] && 
        highs[i] > highs[i-2] && highs[i] > highs[i+2]) {
      pivotPoints.push({ price: highs[i], type: 'resistance' as const, index: i });
    }
    
    // Support (low pivot)
    if (lows[i] < lows[i-1] && lows[i] < lows[i+1] && 
        lows[i] < lows[i-2] && lows[i] < lows[i+2]) {
      pivotPoints.push({ price: lows[i], type: 'support' as const, index: i });
    }
  }
  
  // Group nearby levels and count touches
  const groupedLevels: { [key: string]: SupportResistanceLevel } = {};
  
  pivotPoints.forEach(pivot => {
    const key = Math.round(pivot.price * 100) / 100; // Round to nearest cent
    
    if (!groupedLevels[key]) {
      groupedLevels[key] = {
        price: pivot.price,
        type: pivot.type,
        strength: 0,
        touches: 0
      };
    }
    
    groupedLevels[key].touches++;
    groupedLevels[key].strength = groupedLevels[key].touches * 0.2;
  });
  
  return Object.values(groupedLevels)
    .filter(level => level.touches >= 2)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10); // Top 10 strongest levels
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1];
  
  const multiplier = 2 / (period + 1);
  let ema = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

function determineMarketCondition(data: any[], ichimoku: IchimokuResult, ema200: number): 'bullish' | 'bearish' | 'sideways' {
  const currentPrice = data[data.length - 1].close;
  const priceChange = (currentPrice - data[Math.max(0, data.length - 20)].close) / data[Math.max(0, data.length - 20)].close;
  
  if (currentPrice > ema200 && ichimoku.signal > 0 && priceChange > 0.02) {
    return 'bullish';
  } else if (currentPrice < ema200 && ichimoku.signal < 0 && priceChange < -0.02) {
    return 'bearish';
  } else {
    return 'sideways';
  }
}

function calculateVolatility(data: any[], period: number): number {
  if (data.length < period) return 0;
  
  const prices = data.slice(-period).map(d => d.close);
  const returns = [];
  
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
  
  return Math.sqrt(variance * 252); // Annualized volatility
}

function calculateOptimalPositionSize(
  portfolioBalance: number,
  riskPerTrade: number,
  confidence: number,
  atr: number,
  currentPrice: number
): number {
  const riskAmount = portfolioBalance * riskPerTrade;
  const stopLossDistance = atr * 2; // 2 ATR stop loss
  const dollarRisk = stopLossDistance;
  
  if (dollarRisk === 0) return 1;
  
  const baseQuantity = riskAmount / dollarRisk;
  const confidenceMultiplier = Math.pow(confidence, 2); // Square confidence for position sizing
  const quantity = Math.floor(baseQuantity * confidenceMultiplier);
  
  return Math.max(1, quantity); // Minimum 1 share/unit
}

function adjustToSupportResistance_OLD(
  params: { stopLoss: number; takeProfit: number },
  currentPrice: number,
  srLevels: SupportResistanceLevel[]
) {
  let { stopLoss, takeProfit } = params;
  
  // Find the nearest support/resistance levels
  const sortedLevels = srLevels
    .map(level => ({ ...level, distance: Math.abs(level.price - currentPrice) }))
    .sort((a, b) => a.distance - b.distance);
  
  // Adjust stop loss to respect nearby support/resistance
  for (const level of sortedLevels) {
    if (Math.abs(level.price - stopLoss) / currentPrice < 0.01) { // Within 1%
      if (level.type === 'support' && stopLoss < level.price) {
        stopLoss = level.price * 0.995; // Slightly below support
      } else if (level.type === 'resistance' && stopLoss > level.price) {
        stopLoss = level.price * 1.005; // Slightly above resistance
      }
    }
  }
  
  let targetPrice = takeProfit;
  
  return targetPrice;
}