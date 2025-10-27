// Shared trading decision logic used by both live trading and backtesting

export type MarketPhase = 'accumulation' | 'uptrend' | 'distribution' | 'downtrend';

export interface MarketPhaseInfo {
  phase: MarketPhase;
  confidence: number;
  reasoning: string[];
}

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
  marketPhase?: MarketPhaseInfo;
  newsSentiment?: number; // -1 to 1, where -1 is bearish, 0 is neutral, 1 is bullish
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

// Detect market phase based on price action, volume, and indicators
export function detectMarketPhase(
  prices: number[],
  volumes: number[],
  indicators: TradingState['indicators']
): MarketPhaseInfo {
  const reasons: string[] = [];
  let phaseScore = {
    accumulation: 0,
    uptrend: 0,
    distribution: 0,
    downtrend: 0
  };
  
  // Need at least 20 candles for phase detection
  if (prices.length < 20) {
    return {
      phase: 'accumulation',
      confidence: 50,
      reasoning: ['Insufficient data for phase detection']
    };
  }
  
  const currentPrice = prices[prices.length - 1];
  const recentPrices = prices.slice(-20);
  const recentVolumes = volumes.slice(-20);
  
  // Calculate price statistics
  const priceHigh = Math.max(...recentPrices);
  const priceLow = Math.min(...recentPrices);
  const priceRange = priceHigh - priceLow;
  const avgPrice = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const priceStdDev = Math.sqrt(
    recentPrices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / recentPrices.length
  );
  const volatilityRatio = priceStdDev / avgPrice;
  
  // Calculate volume statistics
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  const recentAvgVolume = recentVolumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const volumeChange = (recentAvgVolume - avgVolume) / avgVolume;
  
  // Detect higher highs and higher lows (uptrend)
  let higherHighs = 0;
  let higherLows = 0;
  for (let i = 5; i < recentPrices.length; i++) {
    const prevHigh = Math.max(...recentPrices.slice(i - 5, i));
    const currHigh = Math.max(...recentPrices.slice(i - 2, i + 1));
    if (currHigh > prevHigh) higherHighs++;
    
    const prevLow = Math.min(...recentPrices.slice(i - 5, i));
    const currLow = Math.min(...recentPrices.slice(i - 2, i + 1));
    if (currLow > prevLow) higherLows++;
  }
  
  // Detect lower highs and lower lows (downtrend)
  let lowerHighs = 0;
  let lowerLows = 0;
  for (let i = 5; i < recentPrices.length; i++) {
    const prevHigh = Math.max(...recentPrices.slice(i - 5, i));
    const currHigh = Math.max(...recentPrices.slice(i - 2, i + 1));
    if (currHigh < prevHigh) lowerHighs++;
    
    const prevLow = Math.min(...recentPrices.slice(i - 5, i));
    const currLow = Math.min(...recentPrices.slice(i - 2, i + 1));
    if (currLow < prevLow) lowerLows++;
  }
  
  // EMA200 slope
  const ema200Slope = indicators.ema200 > 0 ? 'up' : 'flat';
  const priceAboveEMA = currentPrice > indicators.ema200;
  const emaDeviation = Math.abs((currentPrice - indicators.ema200) / indicators.ema200);
  
  // MACD analysis
  const macdPositive = indicators.macd.histogram > 0;
  const macdNearZero = Math.abs(indicators.macd.histogram) < 0.5;
  
  // ATR analysis (volatility)
  const atrPercent = indicators.atr / currentPrice;
  const lowVolatility = atrPercent < 0.02;
  const highVolatility = atrPercent > 0.05;
  
  // OBV analysis
  const obvPositive = indicators.obv > 0;
  
  // === ACCUMULATION PHASE ===
  // Sideways, low volatility, stable volume
  if (volatilityRatio < 0.015 && lowVolatility) {
    phaseScore.accumulation += 30;
    reasons.push('Low volatility (narrow range)');
  }
  
  if (priceRange / avgPrice < 0.03) {
    phaseScore.accumulation += 25;
    reasons.push('Tight price range');
  }
  
  if (emaDeviation < 0.02) {
    phaseScore.accumulation += 20;
    reasons.push('Price near EMA200');
  }
  
  if (macdNearZero) {
    phaseScore.accumulation += 15;
    reasons.push('MACD near zero');
  }
  
  if (Math.abs(volumeChange) < 0.2) {
    phaseScore.accumulation += 10;
    reasons.push('Stable volume');
  }
  
  // === UPTREND PHASE ===
  // Higher highs/lows, increasing volume, positive indicators
  if (higherHighs >= 8 && higherLows >= 8) {
    phaseScore.uptrend += 40;
    reasons.push('Higher highs and higher lows');
  }
  
  if (priceAboveEMA && emaDeviation > 0.02) {
    phaseScore.uptrend += 20;
    reasons.push('Price above rising EMA200');
  }
  
  if (macdPositive) {
    phaseScore.uptrend += 15;
    reasons.push('Positive MACD');
  }
  
  if (obvPositive) {
    phaseScore.uptrend += 10;
    reasons.push('Increasing OBV');
  }
  
  if (volumeChange > 0.1) {
    phaseScore.uptrend += 15;
    reasons.push('Rising volume on upward moves');
  }
  
  // === DISTRIBUTION PHASE ===
  // Sideways at top of uptrend, high volume but no price movement
  const nearTop = currentPrice > avgPrice && currentPrice >= priceHigh * 0.95;
  
  if (nearTop && volatilityRatio < 0.02) {
    phaseScore.distribution += 30;
    reasons.push('Sideways at top of range');
  }
  
  if (nearTop && volumeChange > 0.3 && priceRange / avgPrice < 0.04) {
    phaseScore.distribution += 30;
    reasons.push('High volume without upward movement');
  }
  
  if (emaDeviation < 0.02 && priceAboveEMA) {
    phaseScore.distribution += 15;
    reasons.push('Price consolidating above EMA200');
  }
  
  if (macdNearZero && priceAboveEMA) {
    phaseScore.distribution += 15;
    reasons.push('MACD diverging from price');
  }
  
  if (highVolatility && nearTop) {
    phaseScore.distribution += 10;
    reasons.push('Increased volatility at peak');
  }
  
  // === DOWNTREND PHASE ===
  // Lower highs/lows, increasing volume on sell-offs, negative indicators
  if (lowerHighs >= 8 && lowerLows >= 8) {
    phaseScore.downtrend += 40;
    reasons.push('Lower highs and lower lows');
  }
  
  if (!priceAboveEMA && emaDeviation > 0.02) {
    phaseScore.downtrend += 20;
    reasons.push('Price below falling EMA200');
  }
  
  if (!macdPositive) {
    phaseScore.downtrend += 15;
    reasons.push('Negative MACD');
  }
  
  if (!obvPositive) {
    phaseScore.downtrend += 10;
    reasons.push('Decreasing OBV');
  }
  
  if (volumeChange > 0.1 && currentPrice < avgPrice) {
    phaseScore.downtrend += 15;
    reasons.push('Rising volume on downward moves');
  }
  
  // Determine winning phase
  const maxScore = Math.max(...Object.values(phaseScore));
  const phase = (Object.entries(phaseScore).find(([_, score]) => score === maxScore)?.[0] || 'accumulation') as MarketPhase;
  const confidence = Math.min(95, Math.max(50, maxScore));
  
  return {
    phase,
    confidence,
    reasoning: reasons.filter(r => 
      (phase === 'accumulation' && r.includes('volatility') || r.includes('range') || r.includes('EMA') || r.includes('MACD') || r.includes('volume')) ||
      (phase === 'uptrend' && (r.includes('Higher') || r.includes('above') || r.includes('Positive') || r.includes('Increasing') || r.includes('Rising'))) ||
      (phase === 'distribution' && (r.includes('top') || r.includes('volume') || r.includes('consolidating') || r.includes('diverging'))) ||
      (phase === 'downtrend' && (r.includes('Lower') || r.includes('below') || r.includes('Negative') || r.includes('Decreasing')))
    )
  };
}

// AI-powered decision making using trained models or rule-based fallback
export async function makeAITradingDecision(
  state: TradingState,
  symbol: string,
  enableShorts: boolean,
  modelWeights?: any,
  marketData?: any[] // Add market data for PPO inference
): Promise<TradingAction> {
  
  // 🧠 USE TRAINED PPO MODEL IF AVAILABLE
  if (modelWeights && marketData && marketData.length >= 200) {
    console.log(`🤖 Using trained PPO model for ${symbol} inference`);
    
    try {
      const { runPPOInference, ppoActionToSignalType } = await import('../_shared/ppo-inference.ts');
      
      const inferenceResult = await runPPOInference(modelWeights, marketData, true);
      const signalType = ppoActionToSignalType(inferenceResult.action.direction);
      
      // Calculate TP/SL based on model outputs and ATR
      const atr = state.indicators.atr;
      const currentPrice = state.price;
      
      // Model outputs: tp_offset in [-0.5, 0.5] ATR, sl_tight in [0.5, 2.0]x
      const tpDistance = (2.0 + inferenceResult.action.tp_offset) * atr; // Base 2.0 ATR + offset
      const slDistance = inferenceResult.action.sl_tight * atr; // Direct multiplier
      
      let stopLoss = currentPrice;
      let takeProfit = currentPrice;
      
      if (signalType === 'BUY') {
        takeProfit = currentPrice + tpDistance;
        stopLoss = currentPrice - slDistance;
      } else if (signalType === 'SELL') {
        takeProfit = currentPrice - tpDistance;
        stopLoss = currentPrice + slDistance;
      }
      
      // Size multiplier from model (0-1 scale)
      const sizeMultiplier = inferenceResult.action.size;
      
      console.log(`🎯 Model Decision: ${signalType} (confidence: ${(inferenceResult.confidence * 100).toFixed(1)}%)
        - TP: $${takeProfit.toFixed(2)} (${tpDistance.toFixed(2)} away)
        - SL: $${stopLoss.toFixed(2)} (${slDistance.toFixed(2)} away)
        - Size Multiplier: ${sizeMultiplier.toFixed(3)}x
        - Value Estimate: ${inferenceResult.value.toFixed(4)}`);
      
      return {
        type: signalType,
        confidence: inferenceResult.confidence * 100, // Convert to percentage
        stopLoss,
        takeProfit,
        reasons: [
          `PPO Model (v=${inferenceResult.value.toFixed(2)})`,
          `${inferenceResult.featureCount} features × ${inferenceResult.sequenceLength} sequence`,
          `Size: ${(sizeMultiplier * 100).toFixed(1)}%`,
        ],
        riskLevel: inferenceResult.confidence > 0.7 ? 'medium' : 'low',
        sizeMultiplier, // Pass to position sizing
      };
      
    } catch (error) {
      console.error(`❌ PPO inference failed: ${error.message}`);
      console.log('⚠️ Falling back to rule-based decision logic');
      // Fall through to rule-based logic
    }
  }
  
  // 📊 FALLBACK: RULE-BASED SCORING
  console.log(`📊 Using rule-based scoring for ${symbol}`);
  
  let bullishScore = 0;
  let bearishScore = 0;
  const reasons: string[] = [];
  
  // 🧠 ADAPTIVE WEIGHTS: Use learned weights or defaults
  const weights = modelWeights?.indicatorWeights || {
    ichimoku: 18,
    ema200: 13,
    macd: 18,
    bollinger: 13,
    volume: 9,
    marketCondition: 9,
    volatility: 9,
    newsSentiment: 11 // News sentiment weight
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
  
  // News sentiment analysis
  if (state.newsSentiment !== undefined && weights.newsSentiment) {
    if (state.newsSentiment > 0.2) {
      bullishScore += weights.newsSentiment * state.newsSentiment;
      reasons.push(`Positive news sentiment (${(state.newsSentiment * 100).toFixed(0)}%)`);
    } else if (state.newsSentiment < -0.2) {
      bearishScore += weights.newsSentiment * Math.abs(state.newsSentiment);
      reasons.push(`Negative news sentiment (${(state.newsSentiment * 100).toFixed(0)}%)`);
    }
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
  
  // 🌊 MARKET PHASE ADJUSTMENT - modifies confidence, not a hard rule
  if (state.marketPhase) {
    const phase = state.marketPhase.phase;
    const phaseConfidence = state.marketPhase.confidence;
    
    if (phase === 'accumulation' || phase === 'distribution') {
      // Consolidation phases: reduce confidence, favor retracements
      confidence = confidence * 0.85; // Reduce confidence by 15%
      reasons.push(`${phase} phase: reduced confidence, favor Fib retracements`);
      
      // Favor only high-confidence signals
      if (confidence < 70) {
        action = 'HOLD';
        reasons.push(`${phase}: confidence too low, avoid weak signals`);
      }
    } else if (phase === 'uptrend' && action === 'BUY') {
      // Uptrend + BUY: boost confidence
      const boost = Math.min(15, phaseConfidence * 0.15);
      confidence = Math.min(95, confidence + boost);
      reasons.push(`Uptrend phase: boosted BUY confidence by ${boost.toFixed(1)}%, favor Fib extensions`);
    } else if (phase === 'downtrend' && action === 'SELL') {
      // Downtrend + SELL: boost confidence
      const boost = Math.min(15, phaseConfidence * 0.15);
      confidence = Math.min(95, confidence + boost);
      reasons.push(`Downtrend phase: boosted SELL confidence by ${boost.toFixed(1)}%, favor Fib extensions`);
    } else if ((phase === 'uptrend' && action === 'SELL') || (phase === 'downtrend' && action === 'BUY')) {
      // Counter-trend trade: reduce confidence significantly
      confidence = confidence * 0.7;
      reasons.push(`${phase}: counter-trend trade, reduced confidence by 30%`);
      
      // Only take counter-trend if very high confidence
      if (confidence < 75) {
        action = 'HOLD';
        reasons.push(`${phase}: counter-trend confidence too low, avoid trade`);
      }
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
  // 🌊 Market phase influences whether we favor retracements or extensions
  const atr = state.indicators.atr;
  let stopLoss = 0;
  let takeProfit = 0;
  
  const phase = state.marketPhase?.phase || 'accumulation';
  const favorRetracements = phase === 'accumulation' || phase === 'distribution';
  const favorExtensions = phase === 'uptrend' || phase === 'downtrend';
  
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
    // 🌊 Phase adjustment: favor extensions in trends, retracements in consolidation
    let fibExtensionLevel: number;
    if (favorExtensions) {
      // Uptrend: use aggressive Fibonacci extensions
      fibExtensionLevel = confidence > 80 ? 1.618 : 1.272;
    } else {
      // Accumulation/Distribution: use conservative Fibonacci retracements
      fibExtensionLevel = confidence > 80 ? 1.272 : 1.0;
    }
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
    // 🌊 Phase adjustment: favor extensions in trends, retracements in consolidation
    let fibExtensionLevel: number;
    if (favorExtensions) {
      // Downtrend: use aggressive Fibonacci extensions
      fibExtensionLevel = confidence > 80 ? 1.618 : 1.272;
    } else {
      // Accumulation/Distribution: use conservative Fibonacci retracements
      fibExtensionLevel = confidence > 80 ? 1.272 : 1.0;
    }
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

// Calculate enhanced confluence score - PHASE 4: GRADIENT SCORING (matches advanced-trading-bot)
export function calculateConfluenceScore(state: TradingState, riskLevel: RiskLevel): number {
  let trendScore = 0.0;
  let momentumScore = 0.0;
  let riskScore = 0.0;
  
  const isCrypto = state.symbol.includes('-USD') || state.symbol.includes('USDT');
  
  // ===== TREND AGREEMENT (40% weight) - GRADIENT SCORING =====
  let trendBullish = 0;
  let trendBearish = 0;
  let trendNeutral = 0;
  
  // 1. EMA 200 Trend
  if (state.price > state.indicators.ema200 * 1.02) {
    trendBullish++;
  } else if (state.price < state.indicators.ema200 * 0.98) {
    trendBearish++;
  } else {
    trendNeutral++;
  }
  
  // 2. MACD Trend
  if (state.indicators.macd.histogram > 0 && state.indicators.macd.macd > state.indicators.macd.signal) {
    trendBullish++;
  } else if (state.indicators.macd.histogram < 0 && state.indicators.macd.macd < state.indicators.macd.signal) {
    trendBearish++;
  } else {
    trendNeutral++;
  }
  
  // 3. Ichimoku Trend
  if (state.indicators.ichimoku.signal > 0.3) {
    trendBullish++;
  } else if (state.indicators.ichimoku.signal < -0.3) {
    trendBearish++;
  } else {
    trendNeutral++;
  }
  
  // GRADIENT SCORING: Partial credit for 2/3 agreement
  const trendAgreement = Math.max(trendBullish, trendBearish);
  if (trendAgreement === 3) {
    trendScore = 1.0 * 0.40; // All 3 agree: 100%
  } else if (trendAgreement === 2) {
    trendScore = 0.67 * 0.40; // 2/3 agree: 67%
  } else if (trendAgreement === 1 && trendNeutral >= 1) {
    trendScore = 0.50 * 0.40; // 1 + neutrals: 50%
  } else if (trendBullish > 0 && trendBearish > 0) {
    trendScore = 0.33 * 0.40; // Mixed: 33%
  }
  
  // ===== MOMENTUM CONFIRMATION (30% weight) - GRADIENT SCORING =====
  let momentumBullish = 0;
  let momentumBearish = 0;
  let momentumNeutral = 0;
  
  const bbPosition = state.indicators.bollinger.position;
  if (bbPosition < 0.25) {
    momentumBullish++;
  } else if (bbPosition > 0.75) {
    momentumBearish++;
  } else {
    momentumNeutral++;
  }
  
  // Volume (reduced weight for crypto)
  const volumeWeight = isCrypto ? 0.3 : 1.0;
  if (state.indicators.obv > 500000) {
    momentumBullish += volumeWeight;
  } else if (state.indicators.obv < -500000) {
    momentumBearish += volumeWeight;
  } else {
    momentumNeutral += volumeWeight;
  }
  
  // Market Phase
  if (state.marketPhase) {
    if (state.marketPhase.phase === 'uptrend') {
      momentumBullish++;
    } else if (state.marketPhase.phase === 'downtrend') {
      momentumBearish++;
    } else {
      momentumNeutral++;
    }
  }
  
  const totalMomentum = momentumBullish + momentumBearish + momentumNeutral;
  const momentumAgreement = Math.max(momentumBullish, momentumBearish);
  const momentumRatio = momentumAgreement / totalMomentum;
  
  if (momentumRatio >= 0.8) {
    momentumScore = 1.0 * 0.30;
  } else if (momentumRatio >= 0.6) {
    momentumScore = 0.67 * 0.30;
  } else if (momentumRatio >= 0.4) {
    momentumScore = 0.50 * 0.30;
  } else {
    momentumScore = 0.33 * 0.30;
  }
  
  // ===== RISK ENVIRONMENT (30% weight) - GRADIENT SCORING =====
  const atrPercent = (state.indicators.atr / state.price) * 100;
  let volatilityScore = 0.0;
  
  if (atrPercent >= 2 && atrPercent <= 6) {
    volatilityScore = 1.0;
  } else if ((atrPercent >= 1 && atrPercent < 2) || (atrPercent > 6 && atrPercent <= 8)) {
    volatilityScore = 0.75;
  } else if (atrPercent < 1) {
    volatilityScore = 0.50;
  } else if (atrPercent > 8 && atrPercent <= 10) {
    volatilityScore = 0.40;
  } else {
    volatilityScore = 0.25;
  }
  
  let marketScore = 0.0;
  if (state.marketCondition === 'bullish' || state.marketCondition === 'bearish') {
    marketScore = 1.0;
  } else if (state.marketCondition === 'sideways') {
    marketScore = 0.5;
  } else {
    marketScore = 0.75;
  }
  
  riskScore = ((volatilityScore + marketScore) / 2) * 0.30;
  
  return trendScore + momentumScore + riskScore;
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
