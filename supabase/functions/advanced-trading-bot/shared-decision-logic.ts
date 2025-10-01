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
  
  // Add Fibonacci information to reasoning if available
  const fibLevels = state.indicators.fibonacci?.levels || [];
  if (fibLevels.length > 0) {
    const fibHigh = Math.max(...fibLevels);
    const fibLow = Math.min(...fibLevels);
    const fibRange = fibHigh - fibLow;
    const pricePosition = (state.price - fibLow) / fibRange;
    
    if (pricePosition < 0.3) {
      reasons.push("Near Fib support zone");
    } else if (pricePosition > 0.7) {
      reasons.push("Near Fib resistance zone");
    }
  }
  
  // Calculate stop loss and take profit using Fibonacci retracements/extensions + ATR
  const atr = state.indicators.atr;
  let stopLoss = 0;
  let takeProfit = 0;
  
  if (action === 'BUY') {
    // Calculate Fibonacci retracement for stop loss
    const fibLevels = state.indicators.fibonacci?.levels || [state.price];
    const priceHigh = Math.max(...fibLevels);
    const priceLow = Math.min(...fibLevels);
    const priceRange = priceHigh - priceLow;
    
    // Use 38.2% Fibonacci retracement for stop loss (or 50% for lower confidence)
    const fibRetracementLevel = confidence > 75 ? 0.382 : 0.5;
    const fibStopLoss = state.price - (priceRange * fibRetracementLevel);
    
    // Use ATR-based stop loss as backup
    const atrStopLoss = state.price - (atr * 2);
    
    // Choose the more conservative stop (further from price for safety)
    stopLoss = Math.min(fibStopLoss, atrStopLoss);
    
    // Calculate Fibonacci extension for take profit
    // Use 161.8% extension for high confidence, 127.2% for moderate
    const fibExtensionLevel = confidence > 80 ? 1.618 : 1.272;
    const fibTakeProfit = state.price + (priceRange * (fibExtensionLevel - 1));
    
    // Use ATR-based take profit as backup
    const atrTakeProfit = state.price + (atr * (confidence > 80 ? 5 : 4));
    
    // Choose the more aggressive target (further from price for better R:R)
    takeProfit = Math.max(fibTakeProfit, atrTakeProfit);
    
  } else if (action === 'SELL') {
    // Calculate Fibonacci retracement for stop loss
    const fibLevels = state.indicators.fibonacci?.levels || [state.price];
    const priceHigh = Math.max(...fibLevels);
    const priceLow = Math.min(...fibLevels);
    const priceRange = priceHigh - priceLow;
    
    // Use 38.2% Fibonacci retracement for stop loss (or 50% for lower confidence)
    const fibRetracementLevel = confidence > 75 ? 0.382 : 0.5;
    const fibStopLoss = state.price + (priceRange * fibRetracementLevel);
    
    // Use ATR-based stop loss as backup
    const atrStopLoss = state.price + (atr * 2);
    
    // Choose the more conservative stop (further from price for safety)
    stopLoss = Math.max(fibStopLoss, atrStopLoss);
    
    // Calculate Fibonacci extension for take profit
    // Use 161.8% extension for high confidence, 127.2% for moderate
    const fibExtensionLevel = confidence > 80 ? 1.618 : 1.272;
    const fibTakeProfit = state.price - (priceRange * (fibExtensionLevel - 1));
    
    // Use ATR-based take profit as backup
    const atrTakeProfit = state.price - (atr * (confidence > 80 ? 5 : 4));
    
    // Choose the more aggressive target (further from price for better R:R)
    takeProfit = Math.min(fibTakeProfit, atrTakeProfit);
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

// Calculate risk parameters using Fibonacci + ATR + Support/Resistance
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
  
  // Enhance with Fibonacci + Support/Resistance if available
  if (state.indicators.fibonacci && state.indicators.supportResistance) {
    const fibLevels = state.indicators.fibonacci.levels || [currentPrice];
    const priceHigh = Math.max(...fibLevels);
    const priceLow = Math.min(...fibLevels);
    const priceRange = priceHigh - priceLow;
    
    if (decision.type === 'BUY') {
      // Find nearest support level for better stop loss
      const supportLevels = state.indicators.supportResistance
        .filter(sr => sr.type === 'support' && sr.price < currentPrice)
        .sort((a, b) => b.price - a.price);
      
      if (supportLevels.length > 0) {
        const nearestSupport = supportLevels[0].price;
        // Use Fibonacci retracement or support, whichever is closer but still safe
        const fib382Stop = currentPrice - (priceRange * 0.382);
        stopLoss = Math.max(nearestSupport, fib382Stop, currentPrice - (atr * 2.5));
      }
      
      // Find nearest resistance for target
      const resistanceLevels = state.indicators.supportResistance
        .filter(sr => sr.type === 'resistance' && sr.price > currentPrice)
        .sort((a, b) => a.price - b.price);
      
      if (resistanceLevels.length > 0) {
        const nearestResistance = resistanceLevels[0].price;
        // Use Fibonacci extension or resistance, whichever is further for better reward
        const fib1618Target = currentPrice + (priceRange * 0.618);
        takeProfit = Math.max(nearestResistance, fib1618Target, currentPrice + (atr * 4));
      }
      
    } else if (decision.type === 'SELL') {
      // Find nearest resistance for better stop loss
      const resistanceLevels = state.indicators.supportResistance
        .filter(sr => sr.type === 'resistance' && sr.price > currentPrice)
        .sort((a, b) => a.price - b.price);
      
      if (resistanceLevels.length > 0) {
        const nearestResistance = resistanceLevels[0].price;
        const fib382Stop = currentPrice + (priceRange * 0.382);
        stopLoss = Math.min(nearestResistance, fib382Stop, currentPrice + (atr * 2.5));
      }
      
      // Find nearest support for target
      const supportLevels = state.indicators.supportResistance
        .filter(sr => sr.type === 'support' && sr.price < currentPrice)
        .sort((a, b) => b.price - a.price);
      
      if (supportLevels.length > 0) {
        const nearestSupport = supportLevels[0].price;
        const fib1618Target = currentPrice - (priceRange * 0.618);
        takeProfit = Math.min(nearestSupport, fib1618Target, currentPrice - (atr * 4));
      }
    }
  }
  
  // Adjust based on confidence - tighter stops and bigger targets for high confidence
  if (decision.confidence > 85) {
    const confidenceMultiplier = 1.2;
    if (decision.type === 'BUY') {
      stopLoss = Math.max(stopLoss, currentPrice - (atr * 1.5));
      takeProfit = currentPrice + (Math.abs(takeProfit - currentPrice) * confidenceMultiplier);
    } else if (decision.type === 'SELL') {
      stopLoss = Math.min(stopLoss, currentPrice + (atr * 1.5));
      takeProfit = currentPrice - (Math.abs(currentPrice - takeProfit) * confidenceMultiplier);
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
