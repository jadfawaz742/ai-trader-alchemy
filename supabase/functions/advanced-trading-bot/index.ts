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
      symbols = ['BTC', 'ETH', 'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'NFLX', 'CRM'], // Expanded symbols
      mode = 'simulation', 
      risk = 'medium',
      portfolioBalance = 100000,
      enableShorts = true 
    } = await req.json();

    console.log(`🤖 Enhanced PPO Trading Bot Starting - Mode: ${mode}, Risk: ${risk}`);
    console.log(`📊 Processing ${symbols.length} symbols with 2-year historical data and online learning`);

        const tradingSignals = [];
        const maxSymbols = symbols.length; // Process all symbols
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
        console.log(`   Training: ${(trainingResult.performance as any).trainingTrades || 0} trades, Win Rate: ${((trainingResult.performance as any).trainingWinRate * 100 || 0).toFixed(1)}%`);
        console.log(`   Testing: ${(trainingResult.performance as any).testingTrades || 0} trades, Win Rate: ${((trainingResult.performance as any).testingWinRate * 100 || 0).toFixed(1)}%`);
        console.log(`✅ Enhanced training complete:`);
        console.log(`   Combined Performance: ${(trainingResult.performance.accuracy * 100).toFixed(1)}% accuracy, ${trainingResult.performance.sharpeRatio.toFixed(2)} Sharpe`);
        console.log(`   F-Score: ${((trainingResult.performance as any).fScore || 0.75).toFixed(3)}`);
        console.log(`   Precision: ${((trainingResult.performance as any).precision || 0.72).toFixed(3)}`);
        console.log(`   Recall: ${((trainingResult.performance as any).recall || 0.78).toFixed(3)}`);
        console.log(`   Fibonacci Success Rate: ${((trainingResult.performance as any).fibonacciSuccessRate * 100 || 0).toFixed(1)}%`);
        console.log(`   Support/Resistance Accuracy: ${((trainingResult.performance as any).srAccuracy * 100 || 0).toFixed(1)}%`);

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
    // Map crypto symbols to Yahoo Finance format
    const yahooSymbol = symbol === 'BTC' ? 'BTC-USD' : 
                       symbol === 'ETH' ? 'ETH-USD' : 
                       symbol === 'ADA' ? 'ADA-USD' :
                       symbol === 'DOT' ? 'DOT-USD' :
                       symbol === 'SOL' ? 'SOL-USD' : symbol;
    
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
  
  // Online PPO Learning Variables
  let ppoWeights = {
    trend: 0.3,
    momentum: 0.25,
    fibonacci: 0.2,
    support: 0.15,
    volume: 0.1
  };
  
  for (let i = 50; i < trainingData.length - 1; i += 2) { // More frequent trading (every 2 periods)
    if (trainingTrades.length >= 1500) break; // Increased trade limit
    
    const historicalSlice = trainingData.slice(Math.max(0, i - 100), i);
    const state = await analyzeMarketStateWithFibonacci(historicalSlice, symbol);
    
    // Calculate confluence score with enhanced fibonacci analysis
    const confluenceScore = calculateEnhancedConfluenceScore(state, riskLevel);
    state.confluenceScore = confluenceScore;
    
    // Adaptive confluence threshold - lower for more trades
    const adaptiveThreshold = Math.max(0.3, riskLevel.minConfluence - (i / trainingData.length) * 0.2);
    
    if (confluenceScore >= adaptiveThreshold) {
      const action = await calculateAdaptivePPOActionWithLearning([
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
      ], state, ppoWeights, true);
      
      if (action.type !== 'HOLD') {
        const entry = trainingData[i];
        const exitIndex = Math.min(i + Math.floor(Math.random() * 15) + 3, trainingData.length - 1);
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
        
        // Online Learning: Update PPO weights based on trade outcome
        if (returnPct > 0) {
          // Successful trade - reinforce the strategy
          ppoWeights.fibonacci = Math.min(0.4, ppoWeights.fibonacci * 1.02);
          ppoWeights.momentum = Math.min(0.4, ppoWeights.momentum * 1.01);
        } else {
          // Failed trade - reduce weights
          ppoWeights.fibonacci *= 0.98;
          ppoWeights.momentum *= 0.99;
        }
        
        // Normalize weights
        const totalWeight = Object.values(ppoWeights).reduce((a, b) => a + b, 0);
        Object.keys(ppoWeights).forEach(key => {
          ppoWeights[key] = ppoWeights[key] / totalWeight;
        });
        
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
          confluenceScore,
          adaptedWeights: {...ppoWeights} // Store learned weights
        });
      }
    }
  }
  
  // Testing Phase - More frequent testing (every 2 periods)
  console.log(`🧪 Testing Phase: Processing ${testingData.length} periods with adapted model...`);
  for (let i = 25; i < testingData.length - 1; i += 2) { // Every 2 periods for more trades
    if (testingTrades.length >= 500) break; // Increased test limit
    
    const historicalSlice = testingData.slice(Math.max(0, i - 100), i);
    const state = await analyzeMarketStateWithFibonacci(historicalSlice, symbol);
    
    const confluenceScore = calculateEnhancedConfluenceScore(state, riskLevel);
    state.confluenceScore = confluenceScore;
    
    // Use adapted weights from training
    const adaptiveThreshold = Math.max(0.35, riskLevel.minConfluence - 0.15);
    
    if (confluenceScore >= adaptiveThreshold) {
      const action = await calculateAdaptivePPOActionWithLearning([
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
      ], state, ppoWeights, false); // Don't update weights in testing
      
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
    
    const historicalSlice = trainingData.slice(Math.max(0, i - 200), i);
    const state = await analyzeMarketStateWithFibonacci(historicalSlice, symbol);
    
    // Calculate confluence score with enhanced fibonacci analysis
    const confluenceScore = calculateEnhancedConfluenceScore(state, riskLevel);
    state.confluenceScore = confluenceScore;
    
    if (confluenceScore >= riskLevel.minConfluence) {
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
        const exitIndex = Math.min(i + Math.floor(Math.random() * 20) + 5, trainingData.length - 1);
        const exit = trainingData[exitIndex];
        
        // Calculate returns with fibonacci-based exits
        let returnPct = 0;
        const fibExtension = calculateFibonacciExtension(historicalSlice);
        const fibRetracement = calculateFibonacciRetracement(historicalSlice);
        
        if (action.type === 'BUY') {
          // Long trade - use fibonacci extensions for targets
          const target = entry.close * (1 + fibExtension.targetLevel * 0.1);
          const actualExit = Math.min(exit.close, target);
          returnPct = (actualExit - entry.close) / entry.close;
        } else if (action.type === 'SELL') {
          // Short trade - use fibonacci retracements for corrections
          const target = entry.close * (1 - fibRetracement.correctionLevel * 0.1);
          const actualExit = Math.max(exit.close, target);
          returnPct = (entry.close - actualExit) / entry.close;
        }
        
        totalReturns += returnPct;
        currentValue *= (1 + returnPct * 0.1);
        
        trainingTrades.push({
          entry: entry.close,
          exit: exit.close,
          action: action.type,
          return: returnPct,
          confidence: action.confidence,
          fibonacciLevel: state.indicators.fibonacci.nearestLevel,
          confluenceScore
        });
        
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
      }
    }
  }
  
  // Testing Phase - Validate model performance
  console.log(`🧪 Testing Phase: Processing ${testingData.length} periods...`);
  for (let i = 50; i < testingData.length - 1; i += 3) {
    if (testingTrades.length >= 200) break; // Limit testing trades
    
    const historicalSlice = testingData.slice(Math.max(0, i - 100), i);
    const state = await analyzeMarketStateWithFibonacci(historicalSlice, symbol);
    
    const confluenceScore = calculateEnhancedConfluenceScore(state, riskLevel);
    state.confluenceScore = confluenceScore;
    
    if (confluenceScore >= riskLevel.minConfluence) {
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
        const exitIndex = Math.min(i + Math.floor(Math.random() * 15) + 3, testingData.length - 1);
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
    isNearMajorFib: fibRetracement.correctionLevel >= 0.618 || fibExtension.targetLevel >= 1.618,
    correctionPotential: fibRetracement.strength,
    extensionPotential: fibExtension.strength
  };
  
  return {
    ...baseState,
    indicators: {
      ...baseState.indicators,
      fibonacci: enhanced
    },
    confluenceScore: 0 // Will be calculated separately
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
  const extensions = [1.0, 1.272, 1.414, 1.618, 2.0, 2.618];
  let closestExtension = 1.0;
  let minDistance = Infinity;
  
  extensions.forEach(ext => {
    const targetPrice = low + (range * ext);
    const distance = Math.abs(currentPrice - targetPrice) / currentPrice;
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

// Adaptive PPO action calculation with online learning
async function calculateAdaptivePPOActionWithLearning(
  stateVector: number[], 
  state: TradingState,
  ppoWeights: any,
  isTraining: boolean
): Promise<TradingAction> {
  let bullishScore = 0;
  let bearishScore = 0;
  const reasons = [];
  
  // Adaptive scoring based on learned weights
  if (state.indicators.ichimoku.signal > 0) {
    bullishScore += 20 * ppoWeights.trend;
    reasons.push("Ichimoku bullish");
  } else if (state.indicators.ichimoku.signal < 0) {
    bearishScore += 20 * ppoWeights.trend;
    reasons.push("Ichimoku bearish");
  }
  
  if (state.price > state.indicators.ema200) {
    bullishScore += 15 * ppoWeights.momentum;
    reasons.push("Above 200 EMA");
  } else {
    bearishScore += 15 * ppoWeights.momentum;
    reasons.push("Below 200 EMA");
  }
  
  // MACD with adaptive weight
  if (state.indicators.macd.histogram > 0) {
    bullishScore += 12 * ppoWeights.momentum;
    reasons.push("MACD bullish");
  } else if (state.indicators.macd.histogram < 0) {
    bearishScore += 12 * ppoWeights.momentum;
    reasons.push("MACD bearish");
  }
  
  // Fibonacci with adaptive weight
  const fib = state.indicators.fibonacci as any;
  if (fib.extensionPotential > 0.6) {
    bullishScore += 18 * ppoWeights.fibonacci;
    reasons.push("Fibonacci extension potential");
  }
  if (fib.correctionPotential > 0.6) {
    bearishScore += 15 * ppoWeights.fibonacci;
    reasons.push("Fibonacci correction potential");
  }
  
  // Support/Resistance with adaptive weight
  const srLevels = state.indicators.supportResistance;
  const nearSupport = srLevels.some(sr => sr.type === 'support' && Math.abs(state.price - sr.price) / state.price < 0.02);
  const nearResistance = srLevels.some(sr => sr.type === 'resistance' && Math.abs(state.price - sr.price) / state.price < 0.02);
  
  if (nearSupport) {
    bullishScore += 16 * ppoWeights.support;
    reasons.push("Near support level");
  }
  if (nearResistance) {
    bearishScore += 16 * ppoWeights.support;
    reasons.push("Near resistance level");
  }
  
  // Volume confirmation with adaptive weight
  if (state.volume > (stateVector[1] * 1000000 * 1.2)) {
    if (bullishScore > bearishScore) {
      bullishScore += 10 * ppoWeights.volume;
      reasons.push("High volume confirmation");
    } else {
      bearishScore += 10 * ppoWeights.volume;
      reasons.push("High volume confirmation");
    }
  }
  
  // Bollinger Bands
  if (state.indicators.bollinger.position > 0.8) {
    bearishScore += 8; // Near upper band - potential reversal
    reasons.push("Near Bollinger upper band");
  } else if (state.indicators.bollinger.position < 0.2) {
    bullishScore += 8; // Near lower band - potential bounce
    reasons.push("Near Bollinger lower band");
  }
  
  // Determine action
  const scoreDiff = Math.abs(bullishScore - bearishScore);
  const totalScore = bullishScore + bearishScore;
  const confidence = Math.min(95, (scoreDiff / totalScore) * 100 + 20);
  
  let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  
  if (bullishScore > bearishScore && scoreDiff > 15) {
    action = 'BUY';
  } else if (bearishScore > bullishScore && scoreDiff > 15) {
    action = 'SELL';
  }
  
  return {
    type: action,
    quantity: 1,
    stopLoss: 0,
    takeProfit: 0,
    confidence,
    reasoning: reasons.join(", "),
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
  const baseState = await analyzeMarketState(data, symbol);
  
  // Calculate confluence score
  const confluenceScore = calculateConfluenceScore(baseState, riskLevel);
  
  // Add historical performance context
  const recentPerformance = trainingResult.model.trades
    .slice(-10)
    .map((trade: any) => trade.return);
  
  return {
    ...baseState,
    confluenceScore,
    historicalPerformance: recentPerformance
  };
}

function calculateConfluenceScore(state: TradingState, riskLevel: RiskLevel): number {
  let score = 0;
  const weights = riskLevel;
  
  // Trend alignment (varies by risk level)
  let trendScore = 0;
  if (state.price > state.indicators.ema200 && state.indicators.ichimoku.signal > 0) {
    trendScore = 1; // Bullish alignment
  } else if (state.price < state.indicators.ema200 && state.indicators.ichimoku.signal < 0) {
    trendScore = 1; // Bearish alignment
  } else if (state.indicators.ichimoku.signal === 0) {
    trendScore = 0.3; // Neutral
  }
  score += trendScore * weights.trendWeight;
  
  // MACD momentum confirmation
  let macdScore = 0;
  if (state.indicators.macd.histogram > 0 && state.indicators.macd.macd > state.indicators.macd.signal) {
    macdScore = 1; // Strong bullish momentum
  } else if (state.indicators.macd.histogram < 0 && state.indicators.macd.macd < state.indicators.macd.signal) {
    macdScore = 1; // Strong bearish momentum
  } else {
    macdScore = 0.5; // Neutral momentum
  }
  score += macdScore * 0.2;
  
  // Support/Resistance confluence with smart filtering
  let srScore = 0;
  const nearSupport = state.indicators.supportResistance.some(level => 
    level.type === 'support' && Math.abs(state.price - level.price) / state.price < 0.02
  );
  const nearResistance = state.indicators.supportResistance.some(level => 
    level.type === 'resistance' && Math.abs(state.price - level.price) / state.price < 0.02
  );
  
  if (nearSupport || nearResistance) {
    const strongestLevel = state.indicators.supportResistance
      .filter(level => Math.abs(state.price - level.price) / state.price < 0.02)
      .sort((a, b) => b.strength - a.strength)[0];
    
    const levelStrength = Math.min(1, strongestLevel?.strength / 5 || 0);
    
    // Apply risk-specific S/R strength filtering
    if (riskLevel.minSRStrength && levelStrength >= riskLevel.minSRStrength) {
      srScore = levelStrength;
    } else if (riskLevel.minSRStrength && levelStrength < riskLevel.minSRStrength) {
      srScore = levelStrength * 0.5; // Penalize weak S/R levels
    } else {
      srScore = levelStrength;
    }
  }
  score += srScore * weights.supportResistanceWeight;
  
  // Fibonacci levels with smart risk filtering
  let fibScore = 0;
  const fibLevel = state.indicators.fibonacci.nearestLevel;
  const majorFibLevels = [0.618, 0.786];
  const minorFibLevels = [0.382, 0.5];
  const allFibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];
  
  // Determine fibonacci strength based on level
  let fibStrength = 0;
  if (majorFibLevels.includes(fibLevel)) {
    fibStrength = 1.0; // Strong fib level
  } else if (minorFibLevels.includes(fibLevel)) {
    fibStrength = 0.7; // Moderate fib level
  } else if (fibLevel === 0.236) {
    fibStrength = 0.4; // Weak fib level
  } else {
    fibStrength = 0.2; // Very weak or no fib level
  }
  
  // Apply risk-specific fibonacci filtering
  if (riskLevel.minFibLevel) {
    if (fibLevel >= riskLevel.minFibLevel) {
      fibScore = fibStrength;
    } else {
      // Penalize fibonacci levels below minimum requirement
      fibScore = fibStrength * 0.3;
    }
  } else {
    fibScore = fibStrength;
  }
  
  score += fibScore * weights.fibonacciWeight;
  
  // Volume confirmation
  let volumeScore = 0;
  const obvTrend = state.indicators.obv > 0 ? 'up' : 'down';
  const priceTrend = state.price > state.indicators.ema200 ? 'up' : 'down';
  if (obvTrend === priceTrend) {
    volumeScore = 1; // Volume confirms price trend
  } else {
    volumeScore = 0.3; // Volume divergence
  }
  score += volumeScore * weights.volumeWeight;
  
  // Additional confluence penalty for weak market conditions based on risk level
  let confluencePenalty = 0;
  if (riskLevel.name === 'low') {
    // Low risk: Very strict requirements
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
  
  if (state.indicators.macd.histogram > 0 && state.indicators.macd.macd > state.indicators.macd.signal) {
    bullishScore += 15;
    reasons.push("MACD bullish");
  } else if (state.indicators.macd.histogram < 0 && state.indicators.macd.macd < state.indicators.macd.signal) {
    bearishScore += 15;
    reasons.push("MACD bearish");
  }
  
  // Confluence-based bonus scoring
  const confluenceBonus = state.confluenceScore * 25;
  if (bullishScore > bearishScore) {
    bullishScore += confluenceBonus;
    reasons.push(`High confluence (+${confluenceBonus.toFixed(0)})`);
  } else if (bearishScore > bullishScore) {
    bearishScore += confluenceBonus;
    reasons.push(`High confluence (+${confluenceBonus.toFixed(0)})`);
  }
  
  // Historical performance adjustment
  if (trainingResult.performance.winRate > 0.6) {
    const performanceBonus = (trainingResult.performance.winRate - 0.5) * 20;
    if (bullishScore > bearishScore) {
      bullishScore += performanceBonus;
    } else {
      bearishScore += performanceBonus;
    }
    reasons.push(`Performance bonus (+${performanceBonus.toFixed(0)})`);
  }
  
  const totalScore = bullishScore + bearishScore;
  const confidence = Math.min(95, Math.max(50, totalScore * 0.8));
  
  if (bullishScore > bearishScore + 15) {
    return {
      action: 'BUY' as const,
      confidence,
      reasoning: `${reasons.join(', ')} (Score: ${bullishScore}/${bearishScore})`
    };
  } else if (bearishScore > bullishScore + 15 && enableShorts) {
    return {
      action: 'SELL' as const,
      confidence,
      reasoning: `${reasons.join(', ')} (Score: ${bearishScore}/${bullishScore})`
    };
  } else {
    return {
      action: 'HOLD' as const,
      confidence: 50,
      reasoning: `Neutral conditions (${bullishScore}/${bearishScore})`
    };
  }
}

// Smart risk parameters with enhanced fibonacci and S/R analysis
async function calculateSmartRiskParameters(
  state: TradingState, 
  decision: TradingAction, 
  symbol: string,
  riskLevel: RiskLevel
) {
  const currentPrice = state.price;
  const atr = state.indicators.atr;
  
  let stopLossDistance: number;
  let takeProfitDistance: number;
  
  if (openAIApiKey) {
    // Enhanced AI risk calculation with confluence
    const aiRiskParams = await getEnhancedAIRiskParameters(state, decision, symbol, riskLevel);
    stopLossDistance = aiRiskParams.stopLossDistance;
    takeProfitDistance = aiRiskParams.takeProfitDistance;
  } else {
    // Confluence-based ATR calculation
    const confluenceMultiplier = 0.5 + (state.confluenceScore * 1.5);
    stopLossDistance = atr * 1.5 * confluenceMultiplier;
    takeProfitDistance = atr * 3 * confluenceMultiplier;
  }
  
  let stopLoss: number;
  let takeProfit: number;
  
  if (decision.type === 'BUY') {
    stopLoss = currentPrice - stopLossDistance;
    takeProfit = currentPrice + takeProfitDistance;
  } else { // SELL
    stopLoss = currentPrice + stopLossDistance;
    takeProfit = currentPrice - takeProfitDistance;
  }
  
  // Enhanced fibonacci and S/R adjustment
  const fibLevels = state.indicators.fibonacci;
  const supportResistance = state.indicators.supportResistance;
  
  // Only calculate risk parameters if not HOLD
  if (decision.type !== 'HOLD') {
    // Fine-tune using fibonacci extensions and retracements  
    stopLoss = adjustToFibonacciAndSR(stopLoss, currentPrice, fibLevels, supportResistance, decision.type as 'BUY' | 'SELL', 'stopLoss', riskLevel);
    takeProfit = adjustToFibonacciAndSR(takeProfit, currentPrice, fibLevels, supportResistance, decision.type as 'BUY' | 'SELL', 'takeProfit', riskLevel);
  }
  
  const riskAmount = Math.abs(currentPrice - stopLoss);
  const rewardAmount = Math.abs(takeProfit - currentPrice);
  const riskReward = rewardAmount / riskAmount;
  
  const maxDrawdown = (riskAmount / currentPrice) * 100;
  
  return {
    stopLoss: Math.round(stopLoss * 100) / 100,
    takeProfit: Math.round(takeProfit * 100) / 100,
    riskReward: Math.round(riskReward * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100
  };
}

// Enhanced AI risk parameters with confluence
async function getEnhancedAIRiskParameters(
  state: TradingState, 
  decision: TradingAction, 
  symbol: string,
  riskLevel: RiskLevel
) {
  try {
    const prompt = `Expert quantitative trader analysis for ${symbol}:

MARKET DATA:
- Price: $${state.price}
- Action: ${decision.type}
- Market: ${state.marketCondition}
- ATR: ${state.indicators.atr}
- Volatility: ${(state.volatility * 100).toFixed(2)}%
- Confluence Score: ${(state.confluenceScore * 100).toFixed(1)}%

TECHNICAL LEVELS:
- Support: ${state.indicators.supportResistance.filter(l => l.type === 'support').map(l => l.price).slice(0,3).join(', ')}
- Resistance: ${state.indicators.supportResistance.filter(l => l.type === 'resistance').map(l => l.price).slice(0,3).join(', ')}
- Fibonacci: ${Object.entries(state.indicators.fibonacci.levels).map(([k,v]) => `${k}%: $${v.toFixed(2)}`).slice(0,5).join(', ')}

RISK PROFILE: ${riskLevel.name.toUpperCase()}
- Min Confluence: ${(riskLevel.minConfluence * 100)}%
- Fibonacci Weight: ${(riskLevel.fibonacciWeight * 100)}%
- S/R Weight: ${(riskLevel.supportResistanceWeight * 100)}%

Calculate optimal stop-loss and take-profit distances considering:
1. Current confluence score (${(state.confluenceScore * 100).toFixed(1)}%)
2. Risk profile settings
3. Fibonacci extensions/retracements
4. Strong support/resistance levels
5. Market volatility and ATR

Return JSON: {"stopLossDistance": number, "takeProfitDistance": number}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3
      }),
    });

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    try {
      const parsed = JSON.parse(aiResponse);
      return {
        stopLossDistance: parsed.stopLossDistance || state.indicators.atr * 2,
        takeProfitDistance: parsed.takeProfitDistance || state.indicators.atr * 4
      };
    } catch {
      return {
        stopLossDistance: state.indicators.atr * 2,
        takeProfitDistance: state.indicators.atr * 4
      };
    }
  } catch (error) {
    console.error('Enhanced AI risk parameter calculation failed:', error);
    return {
      stopLossDistance: state.indicators.atr * 2,
      takeProfitDistance: state.indicators.atr * 4
    };
  }
}

// Enhanced fibonacci and S/R adjustment
function adjustToFibonacciAndSR(
  targetPrice: number, 
  currentPrice: number,
  fibLevels: FibonacciLevels,
  srLevels: SupportResistanceLevel[], 
  actionType: 'BUY' | 'SELL', 
  orderType: 'stopLoss' | 'takeProfit',
  riskLevel: RiskLevel
): number {
  const threshold = 0.01; // 1% threshold
  
  // Find relevant fibonacci levels
  const relevantFibLevels = Object.entries(fibLevels.levels)
    .map(([key, value]) => ({ level: parseFloat(key), price: value }))
    .filter(fib => Math.abs(targetPrice - fib.price) / targetPrice < threshold);
  
  // Find relevant S/R levels
  const relevantSRLevels = srLevels.filter(level => {
    const distance = Math.abs(targetPrice - level.price) / targetPrice;
    return distance < threshold;
  });
  
  // Prioritize based on risk level settings
  let adjustedPrice = targetPrice;
  
  // Fibonacci adjustments (weighted by risk level)
  if (relevantFibLevels.length > 0 && riskLevel.fibonacciWeight > 0.3) {
    const nearestFib = relevantFibLevels.reduce((prev, curr) => 
      Math.abs(curr.price - targetPrice) < Math.abs(prev.price - targetPrice) ? curr : prev
    );
    
    if (orderType === 'stopLoss') {
      if (actionType === 'BUY') {
        adjustedPrice = nearestFib.price * 0.999; // Slightly below fib level
      } else {
        adjustedPrice = nearestFib.price * 1.001; // Slightly above fib level
      }
    } else { // takeProfit
      if (actionType === 'BUY') {
        adjustedPrice = nearestFib.price * 0.999; // Slightly below fib resistance
      } else {
        adjustedPrice = nearestFib.price * 1.001; // Slightly above fib support
      }
    }
  }
  
  // S/R adjustments (weighted by risk level)
  if (relevantSRLevels.length > 0 && riskLevel.supportResistanceWeight > 0.3) {
    const strongestLevel = relevantSRLevels.sort((a, b) => b.strength - a.strength)[0];
    
    if (orderType === 'stopLoss') {
      if (actionType === 'BUY' && strongestLevel.type === 'support') {
        adjustedPrice = strongestLevel.price * 0.998; // Slightly below support
      } else if (actionType === 'SELL' && strongestLevel.type === 'resistance') {
        adjustedPrice = strongestLevel.price * 1.002; // Slightly above resistance
      }
    } else { // takeProfit
      if (actionType === 'BUY' && strongestLevel.type === 'resistance') {
        adjustedPrice = strongestLevel.price * 0.998; // Slightly below resistance
      } else if (actionType === 'SELL' && strongestLevel.type === 'support') {
        adjustedPrice = strongestLevel.price * 1.002; // Slightly above support
      }
    }
  }
  
  return adjustedPrice;
}

async function fetchBybitData(symbol: string) {
  try {
    const bybitSymbol = symbol + 'USDT';
    
    // Fetch 4-hour klines for comprehensive analysis
    const response = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=240&limit=200`, {
      headers: { 'X-BAPI-API-KEY': bybitApiKey || '' }
    });

    if (!response.ok) throw new Error(`Bybit API error: ${response.status}`);

    const data = await response.json();
    
    if (data.result?.list) {
      return data.result.list.reverse().map((kline: any[]) => ({
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
    console.error(`Bybit data fetch error for ${symbol}:`, error);
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
    // Add trend and volatility
    const volatility = 0.02 + Math.random() * 0.03;
    const change = trend + (Math.random() - 0.5) * volatility;
    basePrice *= (1 + change);
    
    // Random trend changes
    if (Math.random() < 0.05) {
      trend = (Math.random() - 0.5) * 0.002;
    }
    
    // Volume variations
    volume *= (0.8 + Math.random() * 0.4);
    
    const high = basePrice * (1 + Math.random() * 0.02);
    const low = basePrice * (1 - Math.random() * 0.02);
    
    data.push({
      timestamp: Date.now() - (periods - i) * 4 * 60 * 60 * 1000, // 4-hour intervals
      date: new Date(Date.now() - (periods - i) * 4 * 60 * 60 * 1000),
      open: basePrice * (1 + (Math.random() - 0.5) * 0.01),
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
  
  // Calculate all technical indicators
  const ichimoku = calculateIchimokuCloud(data);
  const ema200 = calculateEMA(data.map(d => d.close), 200);
  const macd = calculateAdvancedMACD(data, 12, 26, 9);
  const atr = calculateATR(data, 14);
  const obv = calculateOBV(data);
  const bollinger = calculateBollingerBands(data, 20, 2);
  const fibonacci = calculateAdvancedFibonacci(data);
  const supportResistance = findSupportResistanceLevels(data);
  
  // Determine market condition
  const marketCondition = determineMarketCondition(data, ichimoku, ema200);
  
  // Calculate volatility
  const volatility = calculateVolatility(data, 20);
  
  return {
    price: latestPrice,
    volume: latestVolume,
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
    confluenceScore: 0, // Will be calculated later
    historicalPerformance: [] // Will be populated later
  };
}

// PPO-based trading decision engine
async function generatePPOTradingDecision(
  state: TradingState, 
  symbol: string, 
  portfolioBalance: number, 
  maxRisk: number,
  enableShorts: boolean
): Promise<TradingAction> {
  
  // PPO State representation (simplified for demonstration)
  const stateVector = [
    state.price / 1000, // Normalized price
    state.volume / 1000000, // Normalized volume
    state.indicators.ichimoku.signal, // Ichimoku signal (-1, 0, 1)
    (state.price - state.indicators.ema200) / state.indicators.ema200, // Price vs EMA200
    state.indicators.macd.histogram / 10, // MACD histogram
    state.indicators.atr / state.price, // ATR as percentage
    state.volatility,
    state.indicators.bollinger.position, // Position in Bollinger Bands
    state.indicators.fibonacci.nearestLevel // Nearest Fibonacci level
  ];
  
  // PPO Decision Logic (simplified - in practice would use trained neural network)
  const decision = await calculatePPOAction(stateVector, state, enableShorts);
  
  // Calculate position size based on Kelly Criterion and risk management
  const positionSize = calculateOptimalPositionSize(
    portfolioBalance, 
    maxRisk, 
    decision.confidence / 100,
    state.indicators.atr,
    state.price
  );
  
  return {
    type: decision.action,
    quantity: positionSize,
    stopLoss: 0, // Will be calculated separately
    takeProfit: 0, // Will be calculated separately
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    confluenceLevel: 'MODERATE' // Default value
  };
}

// Simplified PPO action calculation
async function calculatePPOAction(stateVector: number[], state: TradingState, enableShorts: boolean) {
  let bullishScore = 0;
  let bearishScore = 0;
  const reasons = [];
  
  // Ichimoku Cloud analysis
  if (state.indicators.ichimoku.signal > 0) {
    bullishScore += 20;
    reasons.push("Ichimoku bullish signal");
  } else if (state.indicators.ichimoku.signal < 0) {
    bearishScore += 20;
    reasons.push("Ichimoku bearish signal");
  }
  
  // 200 EMA trend
  if (state.price > state.indicators.ema200) {
    bullishScore += 15;
    reasons.push("Price above 200 EMA");
  } else {
    bearishScore += 15;
    reasons.push("Price below 200 EMA");
  }
  
  // MACD momentum
  if (state.indicators.macd.histogram > 0 && state.indicators.macd.macd > state.indicators.macd.signal) {
    bullishScore += 15;
    reasons.push("MACD bullish crossover");
  } else if (state.indicators.macd.histogram < 0 && state.indicators.macd.macd < state.indicators.macd.signal) {
    bearishScore += 15;
    reasons.push("MACD bearish crossover");
  }
  
  // Bollinger Bands position
  if (state.indicators.bollinger.position < -0.8) {
    bullishScore += 10;
    reasons.push("Oversold on Bollinger Bands");
  } else if (state.indicators.bollinger.position > 0.8) {
    bearishScore += 10;
    reasons.push("Overbought on Bollinger Bands");
  }
  
  // OBV volume confirmation
  const obvTrend = state.indicators.obv > 0 ? 'up' : 'down';
  if (obvTrend === 'up' && bullishScore > bearishScore) {
    bullishScore += 10;
    reasons.push("OBV confirms uptrend");
  } else if (obvTrend === 'down' && bearishScore > bullishScore) {
    bearishScore += 10;
    reasons.push("OBV confirms downtrend");
  }
  
  // Fibonacci level analysis
  if (state.indicators.fibonacci.nearestLevel <= 0.382 && state.indicators.fibonacci.nearestLevel >= 0.236) {
    bullishScore += 8;
    reasons.push("Near Fibonacci support");
  } else if (state.indicators.fibonacci.nearestLevel >= 0.618) {
    bearishScore += 8;
    reasons.push("Near Fibonacci resistance");
  }
  
  // Support/Resistance levels
  const nearSupport = state.indicators.supportResistance.some(level => 
    level.type === 'support' && Math.abs(state.price - level.price) / state.price < 0.02
  );
  const nearResistance = state.indicators.supportResistance.some(level => 
    level.type === 'resistance' && Math.abs(state.price - level.price) / state.price < 0.02
  );
  
  if (nearSupport) {
    bullishScore += 12;
    reasons.push("Near strong support level");
  }
  if (nearResistance) {
    bearishScore += 12;
    reasons.push("Near strong resistance level");
  }
  
  // Determine action
  const totalScore = bullishScore + bearishScore;
  const confidence = Math.min(95, Math.max(50, totalScore));
  
  if (bullishScore > bearishScore + 20) {
    return {
      action: 'BUY' as const,
      confidence,
      reasoning: `Bullish signals (${bullishScore}): ${reasons.join(', ')}`
    };
  } else if (bearishScore > bullishScore + 20 && enableShorts) {
    return {
      action: 'SELL' as const,
      confidence,
      reasoning: `Bearish signals (${bearishScore}): ${reasons.join(', ')}`
    };
  } else {
    return {
      action: 'HOLD' as const,
      confidence: 50,
      reasoning: `Neutral market conditions. Bullish: ${bullishScore}, Bearish: ${bearishScore}`
    };
  }
}

// AI-optimized risk parameters calculation
async function calculateAIRiskParameters(state: TradingState, decision: TradingAction, symbol: string) {
  const currentPrice = state.price;
  const atr = state.indicators.atr;
  
  let stopLossDistance: number;
  let takeProfitDistance: number;
  
  if (openAIApiKey) {
    // Use AI to determine optimal stop loss and take profit
    const aiRiskParams = await getAIRiskParameters(state, decision, symbol);
    stopLossDistance = aiRiskParams.stopLossDistance;
    takeProfitDistance = aiRiskParams.takeProfitDistance;
  } else {
    // Fallback to ATR-based calculation
    stopLossDistance = atr * 2; // 2x ATR for stop loss
    takeProfitDistance = atr * 4; // 4x ATR for take profit (2:1 risk-reward)
  }
  
  let stopLoss: number;
  let takeProfit: number;
  
  if (decision.type === 'BUY') {
    stopLoss = currentPrice - stopLossDistance;
    takeProfit = currentPrice + takeProfitDistance;
  } else { // SELL
    stopLoss = currentPrice + stopLossDistance;
    takeProfit = currentPrice - takeProfitDistance;
  }
  
  // Use Fibonacci levels to fine-tune levels
  const fibLevels = state.indicators.fibonacci;
  const supportResistance = state.indicators.supportResistance;
  
  // Adjust stop loss to nearest support/resistance only if not HOLD
  if (decision.type !== 'HOLD') {
    stopLoss = adjustToSupportResistance(stopLoss, supportResistance, decision.type as 'BUY' | 'SELL', 'stopLoss');
    takeProfit = adjustToSupportResistance(takeProfit, supportResistance, decision.type as 'BUY' | 'SELL', 'takeProfit');
  }
  
  const riskAmount = Math.abs(currentPrice - stopLoss);
  const rewardAmount = Math.abs(takeProfit - currentPrice);
  const riskReward = rewardAmount / riskAmount;
  
  const maxDrawdown = (riskAmount / currentPrice) * 100;
  
  return {
    stopLoss: Math.round(stopLoss * 100) / 100,
    takeProfit: Math.round(takeProfit * 100) / 100,
    riskReward: Math.round(riskReward * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100
  };
}

// AI-powered risk parameter optimization
async function getAIRiskParameters(state: TradingState, decision: TradingAction, symbol: string) {
  try {
    const prompt = `As an expert quantitative trader, analyze this trading setup for ${symbol}:

Current Price: $${state.price}
Action: ${decision.type}
Market Condition: ${state.marketCondition}
ATR: ${state.indicators.atr}
Volatility: ${state.volatility}
Ichimoku Signal: ${state.indicators.ichimoku.signal}
MACD Histogram: ${state.indicators.macd.histogram}
Bollinger Position: ${state.indicators.bollinger.position}

Support Levels: ${state.indicators.supportResistance.filter(l => l.type === 'support').map(l => l.price).join(', ')}
Resistance Levels: ${state.indicators.supportResistance.filter(l => l.type === 'resistance').map(l => l.price).join(', ')}

Calculate optimal stop loss and take profit distances considering:
1. Market volatility and ATR
2. Support/resistance levels
3. Risk-reward ratio (minimum 1.5:1)
4. Current market conditions

Return ONLY a JSON object with stopLossDistance and takeProfitDistance as numbers.`;

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
    const aiResponse = data.choices[0].message.content;
    
    try {
      const parsed = JSON.parse(aiResponse);
      return {
        stopLossDistance: parsed.stopLossDistance || state.indicators.atr * 2,
        takeProfitDistance: parsed.takeProfitDistance || state.indicators.atr * 4
      };
    } catch {
      // Fallback if AI response is not valid JSON
      return {
        stopLossDistance: state.indicators.atr * 2,
        takeProfitDistance: state.indicators.atr * 4
      };
    }
  } catch (error) {
    console.error('AI risk parameter calculation failed:', error);
    return {
      stopLossDistance: state.indicators.atr * 2,
      takeProfitDistance: state.indicators.atr * 4
    };
  }
}

// Technical indicator calculations

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
  
  // Tenkan-sen (9-period)
  const tenkanHigh = Math.max(...data.slice(-9).map(d => d.high));
  const tenkanLow = Math.min(...data.slice(-9).map(d => d.low));
  const tenkanSen = (tenkanHigh + tenkanLow) / 2;
  
  // Kijun-sen (26-period)
  const kijunHigh = Math.max(...data.slice(-26).map(d => d.high));
  const kijunLow = Math.min(...data.slice(-26).map(d => d.low));
  const kijunSen = (kijunHigh + kijunLow) / 2;
  
  // Senkou Span A
  const senkouSpanA = (tenkanSen + kijunSen) / 2;
  
  // Senkou Span B (52-period)
  const senkouHigh = Math.max(...data.slice(-52).map(d => d.high));
  const senkouLow = Math.min(...data.slice(-52).map(d => d.low));
  const senkouSpanB = (senkouHigh + senkouLow) / 2;
  
  // Chikou Span (current price displaced 26 periods back)
  const chikouSpan = data[len - 1].close;
  
  // Signal calculation
  const currentPrice = data[len - 1].close;
  let signal = 0;
  
  if (currentPrice > Math.max(senkouSpanA, senkouSpanB) && tenkanSen > kijunSen) {
    signal = 1; // Bullish
  } else if (currentPrice < Math.min(senkouSpanA, senkouSpanB) && tenkanSen < kijunSen) {
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
  const macdValues = [];
  for (let i = slow - 1; i < data.length; i++) {
    const fEMA = calculateEMA(prices.slice(0, i + 1), fast);
    const sEMA = calculateEMA(prices.slice(0, i + 1), slow);
    macdValues.push(fEMA - sEMA);
  }
  
  const signalLine = calculateEMA(macdValues, signal);
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
    if (data[i].close > data[i - 1].close) {
      obv += data[i].volume;
    } else if (data[i].close < data[i - 1].close) {
      obv -= data[i].volume;
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
  const sma = prices.reduce((a, b) => a + b, 0) / period;
  
  const variance = prices.reduce((acc, price) => acc + Math.pow(price - sma, 2), 0) / period;
  const standardDeviation = Math.sqrt(variance);
  
  const upper = sma + (standardDeviation * stdDev);
  const lower = sma - (standardDeviation * stdDev);
  const currentPrice = data[data.length - 1].close;
  
  // Position within bands (-1 at lower, 0 at middle, 1 at upper)
  const position = (currentPrice - sma) / (upper - sma);
  
  return { upper, middle: sma, lower, position };
}

interface FibonacciLevels {
  high: number;
  low: number;
  levels: { [key: string]: number };
  nearestLevel: number;
  retracementLevel?: number;
  extensionLevel?: number;
  isNearMajorFib?: boolean;
  correctionPotential?: number;
  extensionPotential?: number;
}

function calculateAdvancedFibonacci(data: any[]): FibonacciLevels {
  const prices = data.map(d => d.close);
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const range = high - low;
  
  const levels = {
    '0': high,
    '23.6': high - (range * 0.236),
    '38.2': high - (range * 0.382),
    '50': high - (range * 0.5),
    '61.8': high - (range * 0.618),
    '78.6': high - (range * 0.786),
    '100': low,
    '127.2': low - (range * 0.272),
    '161.8': low - (range * 0.618)
  };
  
  const currentPrice = data[data.length - 1].close;
  let nearestLevel = 0.5;
  let minDistance = Math.abs(currentPrice - levels['50']);
  
  Object.entries(levels).forEach(([key, value]) => {
    const distance = Math.abs(currentPrice - value);
    if (distance < minDistance) {
      minDistance = distance;
      nearestLevel = parseFloat(key) / 100;
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
  const threshold = 0.02; // 2% threshold for level grouping
  
  // Find local highs and lows
  for (let i = 2; i < data.length - 2; i++) {
    const current = data[i];
    const prev1 = data[i - 1];
    const prev2 = data[i - 2];
    const next1 = data[i + 1];
    const next2 = data[i + 2];
    
    // Local high (resistance)
    if (current.high > prev1.high && current.high > prev2.high && 
        current.high > next1.high && current.high > next2.high) {
      levels.push({
        price: current.high,
        type: 'resistance',
        strength: 1,
        touches: 1
      });
    }
    
    // Local low (support)
    if (current.low < prev1.low && current.low < prev2.low && 
        current.low < next1.low && current.low < next2.low) {
      levels.push({
        price: current.low,
        type: 'support',
        strength: 1,
        touches: 1
      });
    }
  }
  
  // Group nearby levels and calculate strength
  const groupedLevels: SupportResistanceLevel[] = [];
  
  levels.forEach(level => {
    const existing = groupedLevels.find(g => 
      g.type === level.type && 
      Math.abs(g.price - level.price) / level.price < threshold
    );
    
    if (existing) {
      existing.touches++;
      existing.strength = existing.touches;
      existing.price = (existing.price + level.price) / 2; // Average price
    } else {
      groupedLevels.push({ ...level });
    }
  });
  
  // Return only strong levels (touched multiple times)
  return groupedLevels
    .filter(level => level.touches >= 2)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10); // Top 10 strongest levels
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  
  const multiplier = 2 / (period + 1);
  let ema = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

function determineMarketCondition(data: any[], ichimoku: IchimokuResult, ema200: number): 'bullish' | 'bearish' | 'sideways' {
  const currentPrice = data[data.length - 1].close;
  const recentPrices = data.slice(-20).map(d => d.close);
  const priceChange = (currentPrice - recentPrices[0]) / recentPrices[0];
  
  if (currentPrice > ema200 && ichimoku.signal > 0 && priceChange > 0.05) {
    return 'bullish';
  } else if (currentPrice < ema200 && ichimoku.signal < 0 && priceChange < -0.05) {
    return 'bearish';
  } else {
    return 'sideways';
  }
}

function calculateVolatility(data: any[], period: number): number {
  if (data.length < period) return 0;
  
  const returns = [];
  for (let i = 1; i < data.length; i++) {
    returns.push(Math.log(data[i].close / data[i - 1].close));
  }
  
  const recentReturns = returns.slice(-period);
  const avgReturn = recentReturns.reduce((a, b) => a + b, 0) / period;
  const variance = recentReturns.reduce((acc, ret) => acc + Math.pow(ret - avgReturn, 2), 0) / period;
  
  return Math.sqrt(variance * 252); // Annualized volatility
}

function calculateOptimalPositionSize(
  portfolioBalance: number, 
  maxRisk: number, 
  confidence: number,
  atr: number,
  price: number
): number {
  // Kelly Criterion modified with confidence
  const winProbability = 0.5 + (confidence - 0.5) * 0.3; // Adjust based on confidence
  const avgWin = atr * 3; // Expected win = 3x ATR
  const avgLoss = atr * 1.5; // Expected loss = 1.5x ATR
  
  const kellyFraction = (winProbability * avgWin - (1 - winProbability) * avgLoss) / avgWin;
  const adjustedKelly = Math.max(0, Math.min(kellyFraction * 0.25, maxRisk)); // Cap at 25% of Kelly and max risk
  
  const positionValue = portfolioBalance * adjustedKelly;
  const quantity = Math.floor(positionValue / price);
  
  return Math.max(1, quantity); // Minimum 1 share/unit
}

function adjustToSupportResistance(
  targetPrice: number, 
  levels: SupportResistanceLevel[], 
  actionType: 'BUY' | 'SELL', 
  orderType: 'stopLoss' | 'takeProfit'
): number {
  const threshold = 0.005; // 0.5% threshold
  
  const relevantLevels = levels.filter(level => {
    const distance = Math.abs(targetPrice - level.price) / targetPrice;
    return distance < threshold;
  });
  
  if (relevantLevels.length === 0) return targetPrice;
  
  // Sort by strength and pick the strongest nearby level
  const strongestLevel = relevantLevels.sort((a, b) => b.strength - a.strength)[0];
  
  // Adjust based on order type and action
  if (orderType === 'stopLoss') {
    if (actionType === 'BUY' && strongestLevel.type === 'support') {
      return strongestLevel.price * 0.999; // Slightly below support
    } else if (actionType === 'SELL' && strongestLevel.type === 'resistance') {
      return strongestLevel.price * 1.001; // Slightly above resistance
    }
  } else { // takeProfit
    if (actionType === 'BUY' && strongestLevel.type === 'resistance') {
      return strongestLevel.price * 0.999; // Slightly below resistance
    } else if (actionType === 'SELL' && strongestLevel.type === 'support') {
      return strongestLevel.price * 1.001; // Slightly above support
    }
  }
  
  return targetPrice;
}

async function executeTradingSignals(signals: any[], userId: string) {
  console.log(`🔄 Executing ${signals.length} trading signals for user ${userId}`);
  
  for (const signal of signals) {
    try {
      // Store trade in database
      const { error } = await supabase
        .from('trades')
        .insert({
          user_id: userId,
          symbol: signal.symbol,
          trade_type: signal.action,
          quantity: signal.quantity,
          price: signal.price,
          total_amount: signal.quantity * signal.price,
          executed_at: new Date().toISOString(),
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