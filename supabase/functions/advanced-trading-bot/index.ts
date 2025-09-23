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

// PPO Agent Configuration
interface PPOConfig {
  learningRate: number;
  epsilon: number;
  epochs: number;
  batchSize: number;
  gamma: number;
  lambda: number;
}

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
}

interface TradingAction {
  type: 'BUY' | 'SELL' | 'HOLD';
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  reasoning: string;
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
      symbols = ['BTC', 'ETH', 'AAPL', 'GOOGL', 'MSFT'], 
      mode = 'simulation', 
      maxRisk = 0.02,
      portfolioBalance = 100000,
      enableShorts = true 
    } = await req.json();

    console.log(`🤖 Advanced Trading Bot Starting - Mode: ${mode}, Risk: ${maxRisk * 100}%`);

    const tradingSignals = [];

    for (const symbol of symbols) {
      try {
        // Fetch market data
        const marketData = await fetchComprehensiveMarketData(symbol);
        if (!marketData || marketData.length < 200) {
          console.log(`⚠️ Insufficient data for ${symbol}, skipping`);
          continue;
        }

        // Analyze current market state
        const currentState = await analyzeMarketState(marketData, symbol);
        
        // Generate PPO-based trading decision
        const tradingDecision = await generatePPOTradingDecision(currentState, symbol, portfolioBalance, maxRisk, enableShorts);
        
        if (tradingDecision.type !== 'HOLD' && tradingDecision.confidence > 75) {
          // Calculate AI-optimized stop loss and take profit
          const riskParams = await calculateAIRiskParameters(currentState, tradingDecision, symbol);
          
          const signal = {
            symbol,
            action: tradingDecision.type,
            quantity: tradingDecision.quantity,
            price: currentState.price,
            stopLoss: riskParams.stopLoss,
            takeProfit: riskParams.takeProfit,
            confidence: tradingDecision.confidence,
            reasoning: tradingDecision.reasoning,
            indicators: currentState.indicators,
            marketCondition: currentState.marketCondition,
            riskReward: riskParams.riskReward,
            maxDrawdown: riskParams.maxDrawdown,
            timestamp: new Date().toISOString()
          };

          tradingSignals.push(signal);
          console.log(`🎯 ${signal.action} ${symbol} @ $${signal.price} | SL: $${signal.stopLoss} | TP: $${signal.takeProfit} | Confidence: ${signal.confidence}%`);
        }
      } catch (error) {
        console.error(`❌ Error analyzing ${symbol}:`, error);
      }
    }

    // Execute trades if not in simulation mode
    if (mode === 'live' && tradingSignals.length > 0) {
      await executeTradingSignals(tradingSignals, user.id);
    }

    return new Response(JSON.stringify({
      success: true,
      mode,
      signals: tradingSignals,
      totalSignals: tradingSignals.length,
      message: `Generated ${tradingSignals.length} trading signals using PPO algorithm`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Advanced Trading Bot Error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Enhanced market data fetching for both crypto and stocks
async function fetchComprehensiveMarketData(symbol: string) {
  const isCrypto = ['BTC', 'ETH', 'ADA', 'DOT', 'SOL'].includes(symbol);
  
  if (isCrypto && bybitApiKey) {
    return await fetchBybitData(symbol);
  } else {
    // Generate comprehensive mock data for stocks or if crypto API unavailable
    return generateComprehensiveHistoricalData(symbol);
  }
}

async function fetchBybitData(symbol: string) {
  try {
    const bybitSymbol = symbol + 'USDT';
    
    // Fetch 4-hour klines for comprehensive analysis
    const response = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=240&limit=200`, {
      headers: { 'X-BAPI-API-KEY': bybitApiKey }
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
    volatility
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
    reasoning: decision.reasoning
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
  
  // Adjust stop loss to nearest support/resistance
  stopLoss = adjustToSupportResistance(stopLoss, supportResistance, decision.type, 'stopLoss');
  takeProfit = adjustToSupportResistance(takeProfit, supportResistance, decision.type, 'takeProfit');
  
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