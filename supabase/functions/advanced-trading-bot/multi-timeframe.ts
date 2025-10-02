// Multi-Timeframe Analysis Module
// Fetches and analyzes multiple timeframes (1h, 4h, 1d) to improve decision quality

interface MultiTimeframeData {
  hourly: any[];
  fourHourly: any[];
  daily: any[];
}

interface TimeframeAnalysis {
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  confluence: number; // How well timeframes align (0-1)
}

// 🚀 OPTIMIZED: Derive multi-timeframe analysis from existing data (for backtesting)
// This avoids making 3 extra API calls per symbol, making backtest 4x faster
export function deriveMultiTimeframeFromHistorical(historicalData: any[]): MultiTimeframeData {
  if (historicalData.length < 20) {
    return { hourly: [], fourHourly: [], daily: [] };
  }
  
  // All data comes from the same source, just analyzed at different granularities
  // Simulate hourly: use recent data as-is
  const hourly = historicalData.slice(-168); // Last 168 periods (~1 week if hourly)
  
  // Simulate 4-hourly: sample every 4th bar
  const fourHourly = historicalData.filter((_, i) => i % 4 === 0).slice(-180); // ~1 month
  
  // Simulate daily: sample every 24th bar (or if data is already daily, use as-is)
  const daily = historicalData.filter((_, i) => i % 24 === 0).slice(-365); // ~1 year
  
  return { hourly, fourHourly, daily };
}

// Fetch multiple timeframes from Yahoo Finance (for live trading)
export async function fetchMultiTimeframeData(symbol: string): Promise<MultiTimeframeData> {
  console.log(`🔍 Fetching multi-timeframe data for ${symbol}...`);
  
  const fetchTimeframe = async (interval: string, range: string) => {
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        }
      );
      
      if (!response.ok) {
        console.log(`⚠️ Failed to fetch ${interval} data for ${symbol}`);
        return [];
      }
      
      const data = await response.json();
      const result = data.chart?.result?.[0];
      
      if (!result) return [];
      
      const timestamps = result.timestamp;
      const quotes = result.indicators.quote[0];
      
      const historicalData = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (quotes.close[i] !== null) {
          historicalData.push({
            timestamp: timestamps[i] * 1000,
            open: quotes.open[i],
            high: quotes.high[i],
            low: quotes.low[i],
            close: quotes.close[i],
            volume: quotes.volume[i]
          });
        }
      }
      
      return historicalData;
    } catch (error) {
      console.log(`❌ Error fetching ${interval} for ${symbol}:`, error);
      return [];
    }
  };
  
  // Fetch all timeframes in parallel
  const [hourly, fourHourly, daily] = await Promise.all([
    fetchTimeframe('1h', '1mo'),   // 1 month of hourly data
    fetchTimeframe('4h', '3mo'),   // 3 months of 4-hour data
    fetchTimeframe('1d', '1y')     // 1 year of daily data
  ]);
  
  return { hourly, fourHourly, daily };
}

// Analyze trend across a timeframe
function analyzeTrend(data: any[]): { trend: 'bullish' | 'bearish' | 'neutral', strength: number } {
  if (data.length < 20) {
    return { trend: 'neutral', strength: 0 };
  }
  
  const recentData = data.slice(-50);
  const prices = recentData.map(d => d.close);
  
  // Calculate EMA 20 and EMA 50
  const ema20 = prices.slice(-20).reduce((sum, p) => sum + p, 0) / 20;
  const ema50 = prices.length >= 50 
    ? prices.slice(-50).reduce((sum, p) => sum + p, 0) / 50
    : ema20;
  
  const currentPrice = prices[prices.length - 1];
  const oldPrice = prices[0];
  const priceChange = ((currentPrice - oldPrice) / oldPrice) * 100;
  
  // Determine trend
  let trend: 'bullish' | 'bearish' | 'neutral';
  let strength = 0;
  
  if (currentPrice > ema20 && ema20 > ema50 && priceChange > 2) {
    trend = 'bullish';
    strength = Math.min(100, Math.abs(priceChange) * 10);
  } else if (currentPrice < ema20 && ema20 < ema50 && priceChange < -2) {
    trend = 'bearish';
    strength = Math.min(100, Math.abs(priceChange) * 10);
  } else {
    trend = 'neutral';
    strength = 50;
  }
  
  return { trend, strength };
}

// Analyze all timeframes and calculate confluence
export function analyzeMultiTimeframe(data: MultiTimeframeData): TimeframeAnalysis {
  const hourlyAnalysis = analyzeTrend(data.hourly);
  const fourHourlyAnalysis = analyzeTrend(data.fourHourly);
  const dailyAnalysis = analyzeTrend(data.daily);
  
  console.log('📊 Multi-timeframe analysis:');
  console.log(`   1H: ${hourlyAnalysis.trend} (${hourlyAnalysis.strength.toFixed(0)}%)`);
  console.log(`   4H: ${fourHourlyAnalysis.trend} (${fourHourlyAnalysis.strength.toFixed(0)}%)`);
  console.log(`   1D: ${dailyAnalysis.trend} (${dailyAnalysis.strength.toFixed(0)}%)`);
  
  // Calculate confluence (how well timeframes align)
  const trends = [hourlyAnalysis.trend, fourHourlyAnalysis.trend, dailyAnalysis.trend];
  const bullishCount = trends.filter(t => t === 'bullish').length;
  const bearishCount = trends.filter(t => t === 'bearish').length;
  
  let overallTrend: 'bullish' | 'bearish' | 'neutral';
  let confluence: number;
  
  if (bullishCount >= 2) {
    overallTrend = 'bullish';
    confluence = bullishCount / 3;
  } else if (bearishCount >= 2) {
    overallTrend = 'bearish';
    confluence = bearishCount / 3;
  } else {
    overallTrend = 'neutral';
    confluence = 0.33; // Low confluence when timeframes don't align
  }
  
  // Weight strength by confluence
  const avgStrength = (
    hourlyAnalysis.strength * 0.3 +
    fourHourlyAnalysis.strength * 0.3 +
    dailyAnalysis.strength * 0.4 // Daily has most weight
  );
  
  const adjustedStrength = avgStrength * confluence;
  
  console.log(`   ✅ Overall: ${overallTrend} | Confluence: ${(confluence * 100).toFixed(0)}% | Strength: ${adjustedStrength.toFixed(0)}%`);
  
  return {
    trend: overallTrend,
    strength: adjustedStrength,
    confluence
  };
}

// Get multi-timeframe boost for trading decisions
export function getMultiTimeframeBoost(analysis: TimeframeAnalysis, tradeType: 'BUY' | 'SELL'): number {
  // High confluence = boost confidence
  // Low confluence = reduce confidence
  
  const isAligned = (
    (tradeType === 'BUY' && analysis.trend === 'bullish') ||
    (tradeType === 'SELL' && analysis.trend === 'bearish')
  );
  
  if (isAligned) {
    // Boost confidence when aligned with multi-timeframe trend
    const boost = analysis.confluence * (analysis.strength / 100) * 20; // Up to +20% confidence
    console.log(`   🚀 Multi-timeframe boost: +${boost.toFixed(1)}% (aligned with ${analysis.trend} trend)`);
    return boost;
  } else {
    // Reduce confidence when going against multi-timeframe trend
    const penalty = analysis.confluence * (analysis.strength / 100) * -15; // Up to -15% confidence
    console.log(`   ⚠️ Multi-timeframe penalty: ${penalty.toFixed(1)}% (against ${analysis.trend} trend)`);
    return penalty;
  }
}
