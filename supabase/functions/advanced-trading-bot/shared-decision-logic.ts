// Shared trading decision logic used by both live trading and backtesting

export interface TradingState {
  price: number;
  volume: number;
  indicators: {
    ichimoku: any;
    ema200: number;
    macd: any;
    atr: number;
    obv: number;
    bollinger: any;
    fibonacci?: any;
    supportResistance?: any[];
  };
  marketCondition: 'bullish' | 'bearish' | 'sideways';
  volatility: number;
  confluenceScore: number;
  historicalPerformance: number[];
}

export interface TradingAction {
  type: 'BUY' | 'SELL' | 'HOLD';
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  reasoning: string;
  confluenceLevel: 'STRONG' | 'MODERATE' | 'WEAK';
}

export interface RiskLevel {
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

// AI-powered decision making using trained models or rule-based fallback
export async function makeAITradingDecision(
  state: TradingState,
  symbol: string,
  enableShorts: boolean,
  modelWeights?: any
): Promise<TradingAction> {
  let bullishScore = 0;
  let bearishScore = 0;
  const reasons: string[] = [];
  
  // 🧠 ADAPTIVE WEIGHTS: Use learned weights or defaults
  const weights = modelWeights?.indicatorWeights || {
    ichimoku: 20,
    ema200: 15,
    macd: 20,
    bollinger: 15,
    volume: 10,
    marketCondition: 10,
    volatility: 10
  };
  
  // Ichimoku analysis
  if (state.indicators.ichimoku.signal > 0) {
    bullishScore += weights.ichimoku;
    reasons.push("Ichimoku bullish");
  } else if (state.indicators.ichimoku.signal < 0) {
    bearishScore += weights.ichimoku;
    reasons.push("Ichimoku bearish");
  }
  
  // EMA 200 trend
  if (state.price > state.indicators.ema200) {
    bullishScore += weights.ema200;
    reasons.push("Above EMA200");
  } else {
    bearishScore += weights.ema200;
    reasons.push("Below EMA200");
  }
  
  // MACD momentum
  if (state.indicators.macd.histogram > 0) {
    bullishScore += weights.macd;
    reasons.push("MACD bullish");
  } else if (state.indicators.macd.histogram < 0) {
    bearishScore += weights.macd;
    reasons.push("MACD bearish");
  }
  
  // Bollinger Bands
  if (state.indicators.bollinger.position < 0.3) {
    bullishScore += weights.bollinger;
    reasons.push("Near lower BB");
  } else if (state.indicators.bollinger.position > 0.7) {
    bearishScore += weights.bollinger;
    reasons.push("Near upper BB");
  }
  
  // Volume confirmation
  if (state.indicators.obv > 0) {
    bullishScore += weights.volume;
    reasons.push("Positive volume");
  } else {
    bearishScore += weights.volume;
    reasons.push("Negative volume");
  }
  
  // Market condition
  if (state.marketCondition === 'bullish') {
    bullishScore += weights.marketCondition;
    reasons.push("Bullish market");
  } else if (state.marketCondition === 'bearish') {
    bearishScore += weights.marketCondition;
    reasons.push("Bearish market");
  }
  
  // Volatility check
  const atrPercent = state.indicators.atr / state.price;
  if (atrPercent > 0.02 && atrPercent < 0.06) {
    bullishScore += weights.volatility;
    bearishScore += weights.volatility;
    reasons.push("Optimal volatility");
  }
  
  // Determine action
  let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let confidence = 50;
  
  const totalScore = bullishScore + bearishScore;
  if (totalScore > 0) {
    if (bullishScore > bearishScore && bullishScore > 40) {
      action = 'BUY';
      confidence = Math.min(95, 50 + (bullishScore - bearishScore));
    } else if (bearishScore > bullishScore && bearishScore > 40 && enableShorts) {
      action = 'SELL';
      confidence = Math.min(95, 50 + (bearishScore - bullishScore));
    }
  }
  
  // Calculate stop loss and take profit based on ATR
  const atr = state.indicators.atr;
  let stopLoss = 0;
  let takeProfit = 0;
  
  if (action === 'BUY') {
    stopLoss = state.price - (atr * 2);
    takeProfit = state.price + (atr * 4);
  } else if (action === 'SELL') {
    stopLoss = state.price + (atr * 2);
    takeProfit = state.price - (atr * 4);
  }
  
  return {
    type: action,
    quantity: 0, // Will be calculated based on portfolio
    stopLoss,
    takeProfit,
    confidence,
    reasoning: reasons.join(', ') || 'Neutral market conditions',
    confluenceLevel: state.confluenceScore >= 0.7 ? 'STRONG' : 
                     state.confluenceScore >= 0.5 ? 'MODERATE' : 'WEAK'
  };
}

// Calculate enhanced confluence score
export function calculateConfluenceScore(state: TradingState, riskLevel: RiskLevel): number {
  let score = 0.0;
  let maxScore = 0.0;
  
  // EMA 200 + MACD trend confirmation (25%)
  maxScore += 0.25;
  const emaDeviation = Math.abs((state.price - state.indicators.ema200) / state.indicators.ema200);
  if (emaDeviation > 0.02) {
    const macdAlign = (state.price > state.indicators.ema200 && state.indicators.macd.histogram > 0) ||
                      (state.price < state.indicators.ema200 && state.indicators.macd.histogram < 0);
    if (macdAlign) score += 0.25;
  }
  
  // Ichimoku cloud (20%)
  maxScore += 0.20;
  if (Math.abs(state.indicators.ichimoku.signal) > 0.5) {
    score += 0.20;
  }
  
  // Bollinger Bands position (15%)
  maxScore += 0.15;
  const bbPosition = state.indicators.bollinger.position;
  if (bbPosition < 0.2 || bbPosition > 0.8) {
    score += 0.15;
  }
  
  // Volume confirmation (15%)
  maxScore += 0.15;
  if (Math.abs(state.indicators.obv) > 500000) {
    score += 0.15;
  }
  
  // Market condition alignment (15%)
  maxScore += 0.15;
  if (state.marketCondition !== 'sideways') {
    score += 0.15;
  }
  
  // Volatility (10%)
  maxScore += 0.10;
  const atrPercent = state.indicators.atr / state.price;
  if (atrPercent > 0.02 && atrPercent < 0.06) {
    score += 0.10;
  }
  
  return score;
}

// Calculate risk parameters
export function calculateRiskParameters(
  state: TradingState,
  decision: TradingAction,
  symbol: string
): {
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  maxDrawdown: number;
} {
  const atr = state.indicators.atr;
  const currentPrice = state.price;
  
  let stopLoss = decision.stopLoss;
  let takeProfit = decision.takeProfit;
  
  // Adjust based on confidence
  if (decision.confidence > 85) {
    // Tighter stops, bigger targets for high confidence
    if (decision.type === 'BUY') {
      stopLoss = currentPrice - (atr * 1.5);
      takeProfit = currentPrice + (atr * 5);
    } else if (decision.type === 'SELL') {
      stopLoss = currentPrice + (atr * 1.5);
      takeProfit = currentPrice - (atr * 5);
    }
  }
  
  const riskAmount = Math.abs(currentPrice - stopLoss);
  const rewardAmount = Math.abs(takeProfit - currentPrice);
  
  return {
    stopLoss,
    takeProfit,
    riskReward: rewardAmount / (riskAmount || 1),
    maxDrawdown: (riskAmount / currentPrice) * 100
  };
}
