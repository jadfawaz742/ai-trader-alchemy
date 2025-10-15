// Technical Indicators Extraction
// Keep existing 15 technical features

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 1. Price Change (1-period return)
function calculatePriceChange(data: OHLCV[], index: number): number {
  if (index < 1) return 0;
  return (data[index].close - data[index - 1].close) / data[index - 1].close;
}

// 2. Volume (normalized by MA20)
function calculateVolumeNorm(data: OHLCV[], index: number): number {
  const period = 20;
  if (index < period) return 1;
  
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += data[i].volume;
  }
  const avgVolume = sum / period;
  
  return avgVolume > 0 ? data[index].volume / avgVolume : 1;
}

// 3. Momentum (5-period)
function calculateMomentum5(data: OHLCV[], index: number): number {
  const period = 5;
  if (index < period) return 0;
  return (data[index].close - data[index - period].close) / data[index - period].close;
}

// 4. Momentum (20-period)
function calculateMomentum20(data: OHLCV[], index: number): number {
  const period = 20;
  if (index < period) return 0;
  return (data[index].close - data[index - period].close) / data[index - period].close;
}

// 5. SMA10 Position
function calculateSMA10Position(data: OHLCV[], index: number): number {
  const period = 10;
  if (index < period) return 0;
  
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += data[i].close;
  }
  const sma = sum / period;
  
  return (data[index].close - sma) / sma;
}

// 6. SMA20 Position
function calculateSMA20Position(data: OHLCV[], index: number): number {
  const period = 20;
  if (index < period) return 0;
  
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += data[i].close;
  }
  const sma = sum / period;
  
  return (data[index].close - sma) / sma;
}

// 7. RSI (14-period)
function calculateRSI(data: OHLCV[], index: number): number {
  const period = 14;
  if (index < period) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = index - period + 1; i <= index; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// 8. MACD (normalized)
function calculateMACD(data: OHLCV[], index: number): number {
  const fastPeriod = 12;
  const slowPeriod = 26;
  
  if (index < slowPeriod) return 0;
  
  // Calculate EMA
  const calculateEMA = (period: number) => {
    const multiplier = 2 / (period + 1);
    let ema = data[index - period + 1].close;
    
    for (let i = index - period + 2; i <= index; i++) {
      ema = (data[i].close - ema) * multiplier + ema;
    }
    
    return ema;
  };
  
  const fastEMA = calculateEMA(fastPeriod);
  const slowEMA = calculateEMA(slowPeriod);
  const macd = fastEMA - slowEMA;
  
  // Normalize by price
  return macd / data[index].close;
}

// 9. Volatility (20-period std dev)
function calculateVolatility(data: OHLCV[], index: number): number {
  const period = 20;
  if (index < period) return 0;
  
  const returns: number[] = [];
  for (let i = index - period + 1; i <= index; i++) {
    if (i > 0) {
      returns.push((data[i].close - data[i - 1].close) / data[i - 1].close);
    }
  }
  
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
}

// 10. ATR (normalized by price)
function calculateATRNorm(data: OHLCV[], index: number): number {
  const period = 14;
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
  
  const atr = atrSum / period;
  return atr / data[index].close;
}

// 11. OBV (On-Balance Volume, normalized)
function calculateOBV(data: OHLCV[], index: number): number {
  if (index < 20) return 0;
  
  let obv = 0;
  for (let i = 1; i <= index; i++) {
    if (data[i].close > data[i - 1].close) {
      obv += data[i].volume;
    } else if (data[i].close < data[i - 1].close) {
      obv -= data[i].volume;
    }
  }
  
  // Normalize by recent volume
  let volumeSum = 0;
  for (let i = index - 19; i <= index; i++) {
    volumeSum += data[i].volume;
  }
  
  return volumeSum > 0 ? obv / volumeSum : 0;
}

// 12. Bollinger Position
function calculateBollingerPosition(data: OHLCV[], index: number): number {
  const period = 20;
  const numStd = 2;
  
  if (index < period) return 0;
  
  // Calculate SMA
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += data[i].close;
  }
  const sma = sum / period;
  
  // Calculate standard deviation
  let variance = 0;
  for (let i = index - period + 1; i <= index; i++) {
    variance += Math.pow(data[i].close - sma, 2);
  }
  const std = Math.sqrt(variance / period);
  
  const upperBand = sma + numStd * std;
  const lowerBand = sma - numStd * std;
  
  // Position within bands: -1 (lower) to +1 (upper)
  if (upperBand === lowerBand) return 0;
  return (data[index].close - lowerBand) / (upperBand - lowerBand) * 2 - 1;
}

// 13. Price Range (high-low / close)
function calculatePriceRange(data: OHLCV[], index: number): number {
  const range = data[index].high - data[index].low;
  return data[index].close > 0 ? range / data[index].close : 0;
}

// 14. EMA50 Position
function calculateEMA50Position(data: OHLCV[], index: number): number {
  const period = 50;
  if (index < period) return 0;
  
  const multiplier = 2 / (period + 1);
  let ema = data[index - period + 1].close;
  
  for (let i = index - period + 2; i <= index; i++) {
    ema = (data[i].close - ema) * multiplier + ema;
  }
  
  return (data[index].close - ema) / ema;
}

// 15. ADX (Average Directional Index)
function calculateADX(data: OHLCV[], index: number): number {
  const period = 14;
  if (index < period + 1) return 0;
  
  let plusDMSum = 0;
  let minusDMSum = 0;
  let trSum = 0;
  
  for (let i = index - period + 1; i <= index; i++) {
    const highDiff = data[i].high - data[i - 1].high;
    const lowDiff = data[i - 1].low - data[i].low;
    
    const plusDM = highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
    const minusDM = lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;
    
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    
    plusDMSum += plusDM;
    minusDMSum += minusDM;
    trSum += tr;
  }
  
  const plusDI = trSum > 0 ? (plusDMSum / trSum) * 100 : 0;
  const minusDI = trSum > 0 ? (minusDMSum / trSum) * 100 : 0;
  
  const diSum = plusDI + minusDI;
  const adx = diSum > 0 ? Math.abs(plusDI - minusDI) / diSum * 100 : 0;
  
  return adx;
}

// Main extraction function (15 features)
export function extractTechnicalFeatures(data: OHLCV[], index: number): number[] {
  return [
    calculatePriceChange(data, index),
    calculateVolumeNorm(data, index),
    calculateMomentum5(data, index),
    calculateMomentum20(data, index),
    calculateSMA10Position(data, index),
    calculateSMA20Position(data, index),
    calculateRSI(data, index) / 100, // Normalize to [0, 1]
    calculateMACD(data, index),
    calculateVolatility(data, index),
    calculateATRNorm(data, index),
    calculateOBV(data, index),
    calculateBollingerPosition(data, index),
    calculatePriceRange(data, index),
    calculateEMA50Position(data, index),
    calculateADX(data, index) / 100 // Normalize to [0, 1]
  ];
}
