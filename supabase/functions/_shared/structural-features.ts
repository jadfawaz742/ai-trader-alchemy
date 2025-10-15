// Structural Features Extraction with ATR Normalization
// No look-ahead bias - all features use data available at or before bar t

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StructuralFeatures {
  // Market Regime (4 one-hot dims)
  reg_acc: number;
  reg_adv: number;
  reg_dist: number;
  reg_decl: number;
  
  // Volatility Regime (1 dim)
  vol_regime: number; // 0=low, 1=mid, 2=high
  
  // Support/Resistance (3 dims)
  dist_to_support: number;  // ATR-normalized
  dist_to_resistance: number; // ATR-normalized
  sr_strength: number;
  
  // Fibonacci (6 dims)
  dist_127_up: number;
  dist_161_up: number;
  dist_127_dn: number;
  dist_161_dn: number;
  dist_38_retrace: number;
  dist_61_retrace: number;
  
  // Context
  atr: number;
  last_swing_high: number | null;
  last_swing_low: number | null;
}

// Calculate ATR (14-period)
function calculateATR(data: OHLCV[], index: number, period: number = 14): number {
  if (index < period) return 0;
  
  let atrSum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = i > 0 ? data[i - 1].close : data[i].open;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    atrSum += tr;
  }
  
  return atrSum / period;
}

// Detect market regime based on MA50 slope and price position
function detectMarketRegime(data: OHLCV[], index: number): {
  reg_acc: number;
  reg_adv: number;
  reg_dist: number;
  reg_decl: number;
} {
  const period = 50;
  if (index < period) {
    return { reg_acc: 0.25, reg_adv: 0.25, reg_dist: 0.25, reg_decl: 0.25 };
  }
  
  // Calculate MA50
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += data[i].close;
  }
  const ma50 = sum / period;
  
  // Calculate MA50 slope (current vs 10 bars ago)
  let prevSum = 0;
  const lookback = Math.min(10, index - period + 1);
  for (let i = index - period - lookback + 1; i <= index - lookback; i++) {
    if (i >= 0) prevSum += data[i].close;
  }
  const prevMa50 = prevSum / period;
  const slope = (ma50 - prevMa50) / prevMa50;
  
  const currentPrice = data[index].close;
  const threshold = 0.005; // 0.5% threshold
  
  // Advancing: slope > +τ AND price > MA50
  if (slope > threshold && currentPrice > ma50) {
    return { reg_acc: 0, reg_adv: 1, reg_dist: 0, reg_decl: 0 };
  }
  
  // Declining: slope < −τ AND price < MA50
  if (slope < -threshold && currentPrice < ma50) {
    return { reg_acc: 0, reg_adv: 0, reg_dist: 0, reg_decl: 1 };
  }
  
  // Accumulation/Distribution: small slope
  if (Math.abs(slope) <= threshold) {
    // Split by price position relative to MA50
    if (currentPrice < ma50 * 0.98) {
      return { reg_acc: 1, reg_adv: 0, reg_dist: 0, reg_decl: 0 }; // Accumulation
    } else {
      return { reg_acc: 0, reg_adv: 0, reg_dist: 1, reg_decl: 0 }; // Distribution
    }
  }
  
  // Neutral/mixed
  return { reg_acc: 0.25, reg_adv: 0.25, reg_dist: 0.25, reg_decl: 0.25 };
}

// Calculate volatility regime based on ATR percentile
function calculateVolatilityRegime(data: OHLCV[], index: number): number {
  const lookback = 100;
  if (index < lookback) return 1; // mid by default
  
  const currentATR = calculateATR(data, index);
  const atrValues: number[] = [];
  
  for (let i = Math.max(0, index - lookback); i < index; i++) {
    atrValues.push(calculateATR(data, i));
  }
  
  atrValues.sort((a, b) => a - b);
  const percentile33 = atrValues[Math.floor(atrValues.length * 0.33)];
  const percentile66 = atrValues[Math.floor(atrValues.length * 0.66)];
  
  if (currentATR <= percentile33) return 0; // low
  if (currentATR <= percentile66) return 1; // mid
  return 2; // high
}

// Find nearest support and resistance levels
function findSupportResistance(data: OHLCV[], index: number): {
  support: number | null;
  resistance: number | null;
  strength: number;
} {
  const lookback = 100;
  const tolerance = 0.01; // 1% zone
  const currentPrice = data[index].close;
  
  if (index < lookback) {
    return { support: null, resistance: null, strength: 0 };
  }
  
  // Find significant levels (highs and lows)
  const levels: { price: number; touches: number }[] = [];
  
  for (let i = Math.max(0, index - lookback); i <= index; i++) {
    const isHigh = i > 0 && i < index &&
      data[i].high >= data[i - 1].high &&
      data[i].high >= data[i + 1]?.high;
    const isLow = i > 0 && i < index &&
      data[i].low <= data[i - 1].low &&
      data[i].low <= data[i + 1]?.low;
    
    if (isHigh) {
      const level = levels.find(l => Math.abs(l.price - data[i].high) / data[i].high < tolerance);
      if (level) {
        level.touches++;
      } else {
        levels.push({ price: data[i].high, touches: 1 });
      }
    }
    
    if (isLow) {
      const level = levels.find(l => Math.abs(l.price - data[i].low) / data[i].low < tolerance);
      if (level) {
        level.touches++;
      } else {
        levels.push({ price: data[i].low, touches: 1 });
      }
    }
  }
  
  // Filter levels with at least 3 touches
  const significantLevels = levels.filter(l => l.touches >= 3);
  
  // Find nearest support and resistance
  const supports = significantLevels.filter(l => l.price < currentPrice);
  const resistances = significantLevels.filter(l => l.price > currentPrice);
  
  const support = supports.length > 0
    ? supports.reduce((prev, curr) => (curr.price > prev.price ? curr : prev)).price
    : null;
    
  const resistance = resistances.length > 0
    ? resistances.reduce((prev, curr) => (curr.price < prev.price ? curr : prev)).price
    : null;
  
  // Calculate average strength (normalized touches)
  const avgTouches = significantLevels.length > 0
    ? significantLevels.reduce((sum, l) => sum + l.touches, 0) / significantLevels.length
    : 0;
  const strength = Math.min(avgTouches / 5, 1); // Normalize to [0, 1]
  
  return { support, resistance, strength };
}

// Find last confirmed swing pair (zigzag with min 3% move)
function findLastSwingPair(data: OHLCV[], index: number): {
  swingHigh: number | null;
  swingLow: number | null;
} {
  const minMove = 0.03; // 3% minimum swing
  const lookback = 50;
  
  if (index < lookback) {
    return { swingHigh: null, swingLow: null };
  }
  
  let swingHigh: number | null = null;
  let swingLow: number | null = null;
  let lastPrice = data[Math.max(0, index - lookback)].close;
  let direction: 'up' | 'down' | null = null;
  
  for (let i = Math.max(0, index - lookback + 1); i <= index; i++) {
    const currentPrice = data[i].close;
    const change = (currentPrice - lastPrice) / lastPrice;
    
    if (direction === null) {
      // Establish initial direction
      if (Math.abs(change) >= minMove) {
        direction = change > 0 ? 'up' : 'down';
        if (direction === 'up') {
          swingLow = lastPrice;
        } else {
          swingHigh = lastPrice;
        }
        lastPrice = currentPrice;
      }
    } else if (direction === 'up') {
      // Looking for swing high
      if (currentPrice > lastPrice) {
        lastPrice = currentPrice; // Update high
      } else if ((lastPrice - currentPrice) / lastPrice >= minMove) {
        // Confirmed swing high
        swingHigh = lastPrice;
        direction = 'down';
        lastPrice = currentPrice;
      }
    } else {
      // Looking for swing low
      if (currentPrice < lastPrice) {
        lastPrice = currentPrice; // Update low
      } else if ((currentPrice - lastPrice) / lastPrice >= minMove) {
        // Confirmed swing low
        swingLow = lastPrice;
        direction = 'up';
        lastPrice = currentPrice;
      }
    }
  }
  
  return { swingHigh, swingLow };
}

// Calculate Fibonacci levels from confirmed swings
function calculateFibonacciLevels(
  swingHigh: number | null,
  swingLow: number | null,
  currentPrice: number
): {
  dist_127_up: number;
  dist_161_up: number;
  dist_127_dn: number;
  dist_161_dn: number;
  dist_38_retrace: number;
  dist_61_retrace: number;
} {
  if (!swingHigh || !swingLow) {
    return {
      dist_127_up: 0,
      dist_161_up: 0,
      dist_127_dn: 0,
      dist_161_dn: 0,
      dist_38_retrace: 0,
      dist_61_retrace: 0
    };
  }
  
  const range = swingHigh - swingLow;
  
  // Upward extensions (from swing low)
  const fib127Up = swingLow + range * 1.272;
  const fib161Up = swingLow + range * 1.618;
  
  // Downward extensions (from swing high)
  const fib127Dn = swingHigh - range * 1.272;
  const fib161Dn = swingHigh - range * 1.618;
  
  // Retracements
  const fib38Retrace = swingHigh - range * 0.382;
  const fib61Retrace = swingHigh - range * 0.618;
  
  return {
    dist_127_up: (fib127Up - currentPrice) / currentPrice,
    dist_161_up: (fib161Up - currentPrice) / currentPrice,
    dist_127_dn: (currentPrice - fib127Dn) / currentPrice,
    dist_161_dn: (currentPrice - fib161Dn) / currentPrice,
    dist_38_retrace: (fib38Retrace - currentPrice) / currentPrice,
    dist_61_retrace: (fib61Retrace - currentPrice) / currentPrice
  };
}

// Main extraction function
export function extractStructuralFeatures(
  data: OHLCV[],
  index: number
): StructuralFeatures {
  if (index < 50) {
    // Return zeros for early bars
    return {
      reg_acc: 0.25,
      reg_adv: 0.25,
      reg_dist: 0.25,
      reg_decl: 0.25,
      vol_regime: 1,
      dist_to_support: 0,
      dist_to_resistance: 0,
      sr_strength: 0,
      dist_127_up: 0,
      dist_161_up: 0,
      dist_127_dn: 0,
      dist_161_dn: 0,
      dist_38_retrace: 0,
      dist_61_retrace: 0,
      atr: 0,
      last_swing_high: null,
      last_swing_low: null
    };
  }
  
  // Calculate ATR
  const atr = calculateATR(data, index);
  
  // Detect market regime
  const regime = detectMarketRegime(data, index);
  
  // Calculate volatility regime
  const volRegime = calculateVolatilityRegime(data, index);
  
  // Find support/resistance
  const { support, resistance, strength } = findSupportResistance(data, index);
  
  // Find last swing pair
  const { swingHigh, swingLow } = findLastSwingPair(data, index);
  
  // Calculate Fibonacci levels
  const fibLevels = calculateFibonacciLevels(swingHigh, swingLow, data[index].close);
  
  // Normalize distances by ATR
  const distToSupport = support && atr > 0
    ? (data[index].close - support) / atr
    : 0;
    
  const distToResistance = resistance && atr > 0
    ? (resistance - data[index].close) / atr
    : 0;
  
  return {
    ...regime,
    vol_regime: volRegime,
    dist_to_support: distToSupport,
    dist_to_resistance: distToResistance,
    sr_strength: strength,
    ...fibLevels,
    atr,
    last_swing_high: swingHigh,
    last_swing_low: swingLow
  };
}

// Extract all 31 features (15 technical + 16 structural)
export function extract31Features(
  data: OHLCV[],
  index: number,
  technicalFeatures: number[]
): number[] {
  const structural = extractStructuralFeatures(data, index);
  
  return [
    ...technicalFeatures, // 15 dims
    structural.reg_acc,
    structural.reg_adv,
    structural.reg_dist,
    structural.reg_decl, // 4 dims (regime)
    structural.vol_regime, // 1 dim
    structural.dist_to_support,
    structural.dist_to_resistance,
    structural.sr_strength, // 3 dims (S/R)
    structural.dist_127_up,
    structural.dist_161_up,
    structural.dist_127_dn,
    structural.dist_161_dn,
    structural.dist_38_retrace,
    structural.dist_61_retrace // 6 dims (Fib)
  ]; // Total: 31 features
}
