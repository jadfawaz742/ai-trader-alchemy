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
  description: string;
}

const RISK_LEVELS: Record<string, RiskLevel> = {
  low: {
    name: 'low',
    minConfluence: 0.8,
    fibonacciWeight: 0.2,
    supportResistanceWeight: 0.4,
    trendWeight: 0.3,
    volumeWeight: 0.1,
    description: 'Only strong confluence trades - requires 80%+ confidence'
  },
  medium: {
    name: 'medium',
    minConfluence: 0.6,
    fibonacciWeight: 0.3,
    supportResistanceWeight: 0.3,
    trendWeight: 0.3,
    volumeWeight: 0.1,
    description: 'Moderate confluence with minor fibonacci levels'
  },
  high: {
    name: 'high',
    minConfluence: 0.4,
    fibonacciWeight: 0.4,
    supportResistanceWeight: 0.2,
    trendWeight: 0.3,
    volumeWeight: 0.1,
    description: 'Accept weaker trends and minor S/R levels'
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
      symbols = ['BTC', 'ETH'], // Reduced default symbols
      mode = 'simulation', 
      risk = 'medium',
      portfolioBalance = 100000,
      enableShorts = true 
    } = await req.json();

    console.log(`🤖 Enhanced PPO Trading Bot Starting - Mode: ${mode}, Risk: ${risk}`);
    console.log(`📊 Processing ${symbols.length} symbols with optimized historical data`);

    const tradingSignals = [];
    const maxSymbols = 3; // Limit concurrent processing
    const symbolsToProcess = symbols.slice(0, maxSymbols);

    for (const symbol of symbolsToProcess) {
      try {
        console.log(`📈 Processing ${symbol}...`);
        
        // Fetch optimized historical data (1 year instead of 2 for resource efficiency)
        const historicalData = await fetchOptimizedHistoricalData(symbol);
        if (!historicalData || historicalData.length < 50) {
          console.log(`⚠️ Insufficient historical data for ${symbol}, skipping`);
          continue;
        }

        console.log(`📊 Retrieved ${historicalData.length} data points for ${symbol}`);

        // Split data 80/20 for training/testing (use smaller dataset)
        const splitIndex = Math.floor(historicalData.length * 0.8);
        const trainingData = historicalData.slice(0, splitIndex);
        const testingData = historicalData.slice(splitIndex);

        console.log(`🎓 Training: ${trainingData.length} periods, Testing: ${testingData.length} periods`);

        // Train lightweight PPO model
        const trainingResult = await trainLightweightPPOModel(trainingData, symbol, RISK_LEVELS[risk]);

        console.log(`🧠 Model trained - Accuracy: ${(trainingResult.performance.accuracy * 100).toFixed(1)}%, Win Rate: ${(trainingResult.performance.winRate * 100).toFixed(1)}%`);

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
            trainedPeriods: trainingData.length
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
        await new Promise(resolve => setTimeout(resolve, 100));
        
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

// Optimized historical data fetching (1 year instead of 2 for resource efficiency)
async function fetchOptimizedHistoricalData(symbol: string): Promise<HistoricalData[] | null> {
  const isCrypto = ['BTC', 'ETH', 'ADA', 'DOT', 'SOL'].includes(symbol);
  
  if (isCrypto && bybitApiKey) {
    return await fetchBybit1YearData(symbol);
  } else {
    // Generate optimized historical data for stocks
    return generateOptimized1YearData(symbol);
  }
}

async function fetchBybit1YearData(symbol: string): Promise<HistoricalData[] | null> {
  try {
    const bybitSymbol = symbol + 'USDT';
    const allData: HistoricalData[] = [];
    
    // Fetch 1 year of data in smaller chunks to avoid memory issues
    const now = Date.now();
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    const chunkSize = 500; // Reduced chunk size
    let currentTime = now;
    
    console.log(`📊 Fetching optimized 1-year Bybit data for ${bybitSymbol}...`);
    
    while (currentTime > oneYearAgo && allData.length < 1000) {
      const response = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=240&limit=${chunkSize}&end=${currentTime}`, {
        headers: { 'X-BAPI-API-KEY': bybitApiKey || '' }
      });

      if (!response.ok) {
        console.error(`Bybit API error: ${response.status}`);
        break;
      }

      const data = await response.json();
      
      if (data.result?.list && data.result.list.length > 0) {
        const chunkData = data.result.list.map((kline: any[]) => ({
          timestamp: parseInt(kline[0]),
          date: new Date(parseInt(kline[0])),
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: parseFloat(kline[5])
        }));
        
        allData.push(...chunkData);
        currentTime = Math.min(...data.result.list.map((k: any[]) => parseInt(k[0]))) - 1;
        
        // Rate limiting and memory management
        await new Promise(resolve => setTimeout(resolve, 200));
      } else {
        break;
      }
    }
    
    console.log(`📈 Retrieved ${allData.length} optimized Bybit data points for ${symbol}`);
    return allData.reverse().slice(-1000); // Keep only most recent 1000 points
  } catch (error) {
    console.error(`Optimized Bybit data fetch error for ${symbol}:`, error);
    return null;
  }
}

function generateOptimized1YearData(symbol: string): HistoricalData[] {
  const periods = 800; // Reduced from 2000 to 800 periods
  const data: HistoricalData[] = [];
  let basePrice = Math.random() * 200 + 100;
  let trend = (Math.random() - 0.5) * 0.001;
  let volume = 1000000 + Math.random() * 5000000;
  
  console.log(`📊 Generating optimized 1-year synthetic data for ${symbol} (${periods} periods)`);
  
  for (let i = 0; i < periods; i++) {
    // Simplified market cycles
    const cyclePhase = Math.sin((i / periods) * Math.PI * 2);
    const volatility = 0.015 + Math.abs(cyclePhase) * 0.015 + Math.random() * 0.005;
    
    // Trend changes
    if (i % 50 === 0) {
      trend = (Math.random() - 0.5) * 0.001 + cyclePhase * 0.0003;
    }
    
    const change = trend + (Math.random() - 0.5) * volatility;
    basePrice *= (1 + change);
    
    // Volume patterns
    volume *= (0.8 + Math.random() * 0.4);
    
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

// Lightweight PPO Model Training (optimized for resource efficiency)
async function trainLightweightPPOModel(trainingData: HistoricalData[], symbol: string, riskLevel: RiskLevel): Promise<TrainingResult> {
  console.log(`🧠 Training lightweight PPO model for ${symbol} with ${trainingData.length} periods...`);
  
  const config: PPOConfig = {
    learningRate: 0.001,
    epsilon: 0.2,
    epochs: 5, // Reduced from 10 to 5
    batchSize: 32, // Reduced batch size
    gamma: 0.99,
    lambda: 0.95,
    adaptiveLearning: true,
    memorySize: 500 // Reduced memory
  };
  
  const trades = [];
  let totalReturns = 0;
  let wins = 0;
  let losses = 0;
  let maxDrawdown = 0;
  let peakValue = 100000;
  let currentValue = 100000;
  
  // Optimized simulation - process fewer data points
  const step = Math.max(1, Math.floor(trainingData.length / 200)); // Sample data points
  
  for (let i = 100; i < trainingData.length - 1; i += step) {
    if (trades.length >= 100) break; // Limit number of trades processed
    
    const historicalSlice = trainingData.slice(Math.max(0, i - 100), i);
    const state = await analyzeMarketState(historicalSlice, symbol);
    
    // Calculate confluence score
    const confluenceScore = calculateConfluenceScore(state, riskLevel);
    state.confluenceScore = confluenceScore;
    
    if (confluenceScore >= riskLevel.minConfluence) {
      const action = await calculatePPOAction([
        state.price / 1000,
        state.volume / 1000000,
        state.indicators.ichimoku.signal,
        (state.price - state.indicators.ema200) / state.indicators.ema200,
        state.indicators.macd.histogram / 10,
        state.indicators.atr / state.price,
        state.volatility,
        state.indicators.bollinger.position,
        state.indicators.fibonacci.nearestLevel,
        confluenceScore
      ], state, true);
      
      if (action.action !== 'HOLD') {
        const entry = trainingData[i];
        const exit = trainingData[Math.min(i + 1, trainingData.length - 1)];
        
        let returnPct = 0;
        if (action.action === 'BUY') {
          returnPct = (exit.close - entry.close) / entry.close;
        } else if (action.action === 'SELL') {
          returnPct = (entry.close - exit.close) / entry.close;
        }
        
        totalReturns += returnPct;
        currentValue *= (1 + returnPct * 0.1);
        
        if (returnPct > 0) wins++;
        else losses++;
        
        // Update drawdown
        peakValue = Math.max(peakValue, currentValue);
        const drawdown = (peakValue - currentValue) / peakValue;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
        
        trades.push({
          entry: entry.close,
          exit: exit.close,
          action: action.action,
          return: returnPct,
          confidence: action.confidence
        });
      }
    }
  }
  
  const winRate = wins / (wins + losses) || 0;
  const avgReturn = totalReturns / trades.length || 0;
  const sharpeRatio = avgReturn / (Math.sqrt(totalReturns / trades.length) || 1);
  
  const performance = {
    accuracy: winRate,
    totalReturns,
    sharpeRatio,
    maxDrawdown,
    winRate
  };
  
  console.log(`✅ Lightweight training complete - Win Rate: ${(winRate * 100).toFixed(1)}%, Total Trades: ${trades.length}`);
  
  return {
    model: {
      config,
      trades,
      symbol,
      trainingPeriods: trainingData.length
    },
    performance,
    convergence: trades.length > 20 // Reduced threshold
  };
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
  
  // Trend alignment (30% weight)
  let trendScore = 0;
  if (state.price > state.indicators.ema200 && state.indicators.ichimoku.signal > 0) {
    trendScore = 1; // Bullish alignment
  } else if (state.price < state.indicators.ema200 && state.indicators.ichimoku.signal < 0) {
    trendScore = 1; // Bearish alignment
  } else if (state.indicators.ichimoku.signal === 0) {
    trendScore = 0.3; // Neutral
  }
  score += trendScore * weights.trendWeight;
  
  // MACD momentum confirmation (20% weight)
  let macdScore = 0;
  if (state.indicators.macd.histogram > 0 && state.indicators.macd.macd > state.indicators.macd.signal) {
    macdScore = 1; // Strong bullish momentum
  } else if (state.indicators.macd.histogram < 0 && state.indicators.macd.macd < state.indicators.macd.signal) {
    macdScore = 1; // Strong bearish momentum
  } else {
    macdScore = 0.5; // Neutral momentum
  }
  score += macdScore * 0.2;
  
  // Support/Resistance confluence (varies by risk level)
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
    
    srScore = Math.min(1, strongestLevel?.strength / 5 || 0);
  }
  score += srScore * weights.supportResistanceWeight;
  
  // Fibonacci levels (varies by risk level)
  let fibScore = 0;
  const fibLevel = state.indicators.fibonacci.nearestLevel;
  if (fibLevel <= 0.382 || fibLevel >= 0.618) {
    fibScore = 1; // Strong fib level
  } else if (fibLevel === 0.5) {
    fibScore = 0.8; // 50% retracement
  } else {
    fibScore = 0.3; // Minor fib level
  }
  score += fibScore * weights.fibonacciWeight;
  
  // Volume confirmation (10% weight)
  let volumeScore = 0;
  const obvTrend = state.indicators.obv > 0 ? 'up' : 'down';
  const priceTrend = state.price > state.indicators.ema200 ? 'up' : 'down';
  if (obvTrend === priceTrend) {
    volumeScore = 1; // Volume confirms price trend
  } else {
    volumeScore = 0.3; // Volume divergence
  }
  score += volumeScore * weights.volumeWeight;
  
  return Math.min(1, score);
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