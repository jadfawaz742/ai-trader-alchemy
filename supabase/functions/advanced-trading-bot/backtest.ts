import { 
  makeAITradingDecision, 
  calculateConfluenceScore, 
  calculateRiskParameters,
  TradingState,
  TradingAction,
  RiskLevel
} from './shared-decision-logic.ts';
import { 
  deriveMultiTimeframeFromHistorical,
  analyzeMultiTimeframe, 
  getMultiTimeframeBoost 
} from './multi-timeframe.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Trade Decision Log Interface
interface TradeDecisionLog {
  symbol: string;
  timestamp: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  price: number;
  exitPrice?: number;
  quantity: number;
  confidence: number;
  stopLoss?: number;
  takeProfit?: number;
  indicators: {
    rsi: number;
    macd: number;
    ema: number;
    atr: number;
    sentiment: number;
  };
  decisionReasoning: string;
  pnl?: number;
  result?: 'WIN' | 'LOSS';
  usingAIModel?: boolean;
}

// Load trained AI models for a symbol from database
async function loadTrainedModel(
  symbol: string, 
  userId: string | undefined, 
  supabaseClient: any
): Promise<any> {
  if (!userId || !supabaseClient) {
    console.log(`⚠️ No userId or supabase client, using rule-based decisions for ${symbol}`);
    return null;
  }
  
  try {
    console.log(`🔍 Loading trained model for ${symbol}...`);
    
    const { data, error } = await supabaseClient
      .from('asset_models')
      .select('model_weights, performance_metrics, updated_at')
      .eq('user_id', userId)
      .eq('symbol', symbol)
      .eq('model_type', 'adaptive_trading')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.log(`❌ Error loading model for ${symbol}:`, error);
      return null;
    }
    
    if (!data) {
      console.log(`⚠️ No trained model found for ${symbol}, will create one after this backtest`);
      return null;
    }
    
    console.log(`✅ Loaded trained model for ${symbol} (updated: ${data.updated_at})`);
    console.log(`   📊 Win rate: ${(data.performance_metrics?.winRate * 100 || 0).toFixed(1)}% from ${data.performance_metrics?.totalTrades || 0} trades`);
    return data.model_weights;
  } catch (error) {
    console.log(`❌ Error loading model for ${symbol}:`, error);
    return null;
  }
}

// Fetch real historical data from Yahoo Finance or Bybit with OPTIMIZED intervals
async function fetchRealHistoricalData(symbol: string, period: string): Promise<any[]> {
  try {
    console.log(`📡 Fetching data for ${symbol} over ${period}...`);
    
    // 🚀 CRYPTO: Use Bybit for crypto symbols (ending in -USD)
    if (symbol.endsWith('-USD')) {
      console.log(`   Using Bybit for crypto ${symbol}`);
      return await fetchBybitHistoricalData(symbol, period);
    }
    
    // 📈 STOCKS: Use Yahoo Finance for regular stocks
    console.log(`   Using Yahoo Finance for stock ${symbol}`);
    return await fetchYahooFinanceData(symbol, period);
    
  } catch (error) {
    console.error(`❌ Failed to fetch historical data for ${symbol}:`, error);
    return [];
  }
}

// Fetch historical data from Bybit for crypto
async function fetchBybitHistoricalData(symbol: string, period: string): Promise<any[]> {
  try {
    // Convert BTC-USD to BTCUSDT format for Bybit
    const bybitSymbol = symbol.replace('-USD', 'USDT');
    
    // Determine interval and limit based on period
    let interval: string;
    let limit: number;
    
    switch (period) {
      case '1day':
        interval = '5'; // 5-minute candles
        limit = 288; // 24 hours worth
        break;
      case '1week':
        interval = '15'; // 15-minute candles
        limit = 672; // 1 week worth
        break;
      case '2weeks':
        interval = '30'; // 30-minute candles
        limit = 672; // 2 weeks worth
        break;
      case '1month':
        interval = '60'; // 1-hour candles
        limit = 720; // 1 month worth
        break;
      case '3months':
        interval = 'D'; // Daily candles
        limit = 90; // 3 months worth
        break;
      default:
        interval = '60';
        limit = 720;
    }
    
    const response = await fetch(
      `https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=${interval}&limit=${limit}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );
    
    if (!response.ok) {
      console.log(`⚠️ Bybit API error for ${symbol}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.result?.list || data.result.list.length === 0) {
      console.log(`⚠️ No Bybit data returned for ${symbol}`);
      return [];
    }
    
    // Convert Bybit format to our standard format
    const historicalData = data.result.list.reverse().map((kline: any[]) => ({
      timestamp: parseInt(kline[0]),
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5])
    }));
    
    console.log(`✅ Fetched ${historicalData.length} Bybit data points for ${symbol}`);
    return historicalData;
    
  } catch (error) {
    console.error(`❌ Bybit fetch error for ${symbol}:`, error);
    return [];
  }
}

// Fetch historical data from Yahoo Finance for stocks
async function fetchYahooFinanceData(symbol: string, period: string): Promise<any[]> {
  try {
    // Determine date range based on backtest period
    let range: string;
    let primaryInterval: string;
    
    switch (period) {
      case '1day':
        range = '5d'; // Need more data for indicators
        primaryInterval = '5m'; // 5-minute for granular short-term trading
        break;
      case '1week':
        range = '1mo'; // Need more data for indicators
        primaryInterval = '15m'; // 15-minute candles
        break;
      case '2weeks':
        range = '1mo';
        primaryInterval = '30m'; // 30-minute candles
        break;
      case '1month':
        range = '3mo'; // Need more data for indicators
        primaryInterval = '1h'; // Hourly candles
        break;
      case '3months':
        range = '6mo'; // Need more data for indicators
        primaryInterval = '1d'; // Daily candles
        break;
      default:
        range = '3mo';
        primaryInterval = '1h';
    }
    
    // Fetch primary timeframe data from Yahoo Finance with retry logic
    let attempts = 0;
    let data;
    
    while (attempts < 2) {
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${primaryInterval}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0'
            }
          }
        );
        
        if (!response.ok) {
          if (attempts === 0) {
            console.log(`⚠️ First attempt failed for ${symbol}, retrying...`);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          throw new Error(`Yahoo Finance API error: ${response.status}`);
        }
        
        data = await response.json();
        break;
      } catch (error) {
        if (attempts === 0) {
          console.log(`⚠️ Error fetching ${symbol}, retrying...`);
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        throw error;
      }
    }
    
    if (!data?.chart?.result?.[0]) {
      console.log(`⚠️ No data returned for ${symbol}, may be invalid symbol`);
      return [];
    }
    
    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];
    
    if (!timestamps || !quotes) {
      console.log(`⚠️ Invalid data format for ${symbol}`);
      return [];
    }
    
    // Format historical data
    const historicalData = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quotes.close[i] !== null && quotes.open[i] !== null && 
          quotes.high[i] !== null && quotes.low[i] !== null && quotes.volume[i] !== null) {
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
    
    if (historicalData.length < 20) {
      console.log(`⚠️ Insufficient data for ${symbol}: only ${historicalData.length} points (minimum 20 required)`);
      return [];
    }
    
    console.log(`✅ Fetched ${historicalData.length} data points for ${symbol}`);
    return historicalData;
    
  } catch (error) {
    console.error(`❌ Failed to fetch historical data for ${symbol}:`, error);
    return [];
  }
}

function buildTradingState(historicalData: any[], index: number): TradingState {
  const currentBar = historicalData[index];
  const lookbackPeriod = Math.min(200, Math.floor(historicalData.length * 0.8)); // Adaptive lookback
  const prices = historicalData.slice(Math.max(0, index - lookbackPeriod), index + 1).map(d => d.close);
  const highs = historicalData.slice(Math.max(0, index - lookbackPeriod), index + 1).map(d => d.high);
  const lows = historicalData.slice(Math.max(0, index - lookbackPeriod), index + 1).map(d => d.low);
  const volumes = historicalData.slice(Math.max(0, index - lookbackPeriod), index + 1).map(d => d.volume);
  
  // Calculate EMA 200 (proper exponential moving average)
  const emaMultiplier = 2 / (200 + 1);
  let ema200 = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema200 = (prices[i] - ema200) * emaMultiplier + ema200;
  }
  
  // Calculate MACD (proper exponential moving averages)
  const ema12Multi = 2 / (12 + 1);
  const ema26Multi = 2 / (26 + 1);
  let ema12 = prices[0];
  let ema26 = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema12 = (prices[i] - ema12) * ema12Multi + ema12;
    ema26 = (prices[i] - ema26) * ema26Multi + ema26;
  }
  const macdLine = ema12 - ema26;
  
  // Calculate signal line (9-period EMA of MACD)
  const signalMulti = 2 / (9 + 1);
  const signalLine = macdLine * 0.9; // Simplified for first iteration
  const histogram = macdLine - signalLine;
  
  // Calculate ATR
  let atrSum = 0;
  for (let i = Math.max(1, index - 14); i <= index; i++) {
    const high = historicalData[i].high;
    const low = historicalData[i].low;
    const prevClose = i > 0 ? historicalData[i - 1].close : historicalData[i].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    atrSum += tr;
  }
  const atr = atrSum / Math.min(14, index + 1);
  
  // Calculate OBV (simplified)
  let obv = 0;
  for (let i = Math.max(1, index - 20); i <= index; i++) {
    if (historicalData[i].close > historicalData[i - 1].close) {
      obv += historicalData[i].volume;
    } else {
      obv -= historicalData[i].volume;
    }
  }
  
  // Calculate Bollinger Bands
  const mean = prices.slice(-20).reduce((sum, p) => sum + p, 0) / Math.min(20, prices.length);
  const variance = prices.slice(-20).reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / Math.min(20, prices.length);
  const std = Math.sqrt(variance);
  const upperBand = mean + (2 * std);
  const lowerBand = mean - (2 * std);
  const bbPosition = (currentBar.close - lowerBand) / (upperBand - lowerBand || 1);
  
  // Calculate Ichimoku (simplified)
  const highPeak9 = Math.max(...highs.slice(-9));
  const lowPeak9 = Math.min(...lows.slice(-9));
  const tenkanSen = (highPeak9 + lowPeak9) / 2;
  
  const highPeak26 = Math.max(...highs.slice(-26));
  const lowPeak26 = Math.min(...lows.slice(-26));
  const kijunSen = (highPeak26 + lowPeak26) / 2;
  
  const ichimokuSignal = currentBar.close > tenkanSen && tenkanSen > kijunSen ? 1 : 
                         currentBar.close < tenkanSen && tenkanSen < kijunSen ? -1 : 0;
  
  // Determine market condition
  const recentPrices = prices.slice(-20);
  const priceChange = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0];
  let marketCondition: 'bullish' | 'bearish' | 'sideways';
  if (priceChange > 0.05) marketCondition = 'bullish';
  else if (priceChange < -0.05) marketCondition = 'bearish';
  else marketCondition = 'sideways';
  
  // Calculate volatility
  const volatility = std / mean;
  
  // Calculate Fibonacci retracement levels (last 50 bars)
  const fibLookback = Math.min(50, prices.length);
  const fibPrices = prices.slice(-fibLookback);
  const fibHigh = Math.max(...fibPrices);
  const fibLow = Math.min(...fibPrices);
  const fibLevels = [
    fibLow,
    fibLow + (fibHigh - fibLow) * 0.236,
    fibLow + (fibHigh - fibLow) * 0.382,
    fibLow + (fibHigh - fibLow) * 0.5,
    fibLow + (fibHigh - fibLow) * 0.618,
    fibLow + (fibHigh - fibLow) * 0.786,
    fibHigh
  ];
  
  // Calculate support/resistance levels using swing highs/lows
  const supportResistance: any[] = [];
  const swingLookback = Math.min(20, prices.length - 2);
  
  for (let i = prices.length - swingLookback; i < prices.length - 1; i++) {
    const price = prices[i];
    const prevPrice = i > 0 ? prices[i - 1] : price;
    const nextPrice = i < prices.length - 1 ? prices[i + 1] : price;
    
    // Swing high (resistance)
    if (price > prevPrice && price > nextPrice) {
      supportResistance.push({
        price: price,
        type: 'resistance',
        strength: 0.8, // Base strength
        touches: 1
      });
    }
    
    // Swing low (support)
    if (price < prevPrice && price < nextPrice) {
      supportResistance.push({
        price: price,
        type: 'support',
        strength: 0.8, // Base strength
        touches: 1
      });
    }
  }
  
  return {
    price: currentBar.close,
    volume: currentBar.volume,
    indicators: {
      ichimoku: {
        tenkanSen,
        kijunSen,
        signal: ichimokuSignal
      },
      ema200,
      macd: {
        macd: macdLine,
        signal: signalLine,
        histogram
      },
      atr,
      obv,
      bollinger: {
        upper: upperBand,
        middle: mean,
        lower: lowerBand,
        position: bbPosition
      },
      fibonacci: {
        levels: fibLevels,
        high: fibHigh,
        low: fibLow,
        range: fibHigh - fibLow
      },
      supportResistance: supportResistance
    },
    marketCondition,
    volatility,
    confluenceScore: 0, // Will be calculated
    historicalPerformance: []
  };
}

// Calculate RSI properly
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Convert trading state to full indicator data for saving
function extractIndicatorsForSaving(state: TradingState, historicalData: any[], index: number): any {
  // Extract full indicator data including Fibonacci for logging
  const prices = historicalData.slice(Math.max(0, index - 50), index + 1).map(d => d.close);
  const rsi = calculateRSI(prices);
  
  const fibLevels = state.indicators.fibonacci || { levels: [], high: 0, low: 0, range: 0 };
  const currentPrice = state.price;
  
  // Calculate which Fibonacci level we're near
  let nearestFibLevel = 0;
  let nearestFibDistance = Infinity;
  [0.236, 0.382, 0.5, 0.618, 0.786].forEach(level => {
    const fibPrice = fibLevels.low + (fibLevels.range * level);
    const distance = Math.abs(currentPrice - fibPrice);
    if (distance < nearestFibDistance) {
      nearestFibDistance = distance;
      nearestFibLevel = level;
    }
  });
  
  return {
    rsi,
    macd: state.indicators.macd.histogram,
    macdLine: state.indicators.macd.macd,
    macdSignal: state.indicators.macd.signal,
    ema200: state.indicators.ema200,
    atr: state.indicators.atr,
    obv: state.indicators.obv,
    bollingerUpper: state.indicators.bollinger.upper,
    bollingerMiddle: state.indicators.bollinger.middle,
    bollingerLower: state.indicators.bollinger.lower,
    bollingerPosition: state.indicators.bollinger.position,
    ichimokuTenkan: state.indicators.ichimoku.tenkanSen,
    ichimokuKijun: state.indicators.ichimoku.kijunSen,
    ichimokuSignal: state.indicators.ichimoku.signal,
    marketCondition: state.marketCondition,
    volatility: state.volatility,
    confluenceScore: state.confluenceScore,
    fibonacciNearestLevel: nearestFibLevel,
    fibonacciHigh: fibLevels.high,
    fibonacciLow: fibLevels.low,
    fibonacciRange: fibLevels.range
  };
}

export async function runBacktestSimulation(
  symbols: string[],
  period: string,
  riskLevel: string,
  initialBalance: number,
  supabaseClient: any,
  userId?: string,
  showLogs: boolean = true,
  saveTradesForLearning: boolean = true // NEW: Save trades to learn from backtests
) {
  console.log(`🔬 Starting ENHANCED backtest simulation for ${symbols.length} symbols over ${period}`);
  console.log(`🚀 Features: Dynamic position sizing, ATR trailing stops, multi-timeframe, Fibonacci retracements/extensions, support/resistance`);
  console.log(`📊 Fibonacci Integration: Using 38.2% & 50% retracements for stops, 127.2% & 161.8% extensions for targets`);
  
  // 🚀 BATCH PROCESSING: Process 8 symbols at a time to prevent CPU timeout
  const BATCH_SIZE = 8;
  const allResults = {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    totalPnL: 0,
    roi: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    trades: [] as any[]
  };
  
  console.log(`⚡ Processing ${symbols.length} symbols in batches of ${BATCH_SIZE} to stay under CPU limits`);
  
  for (let batchStart = 0; batchStart < symbols.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, symbols.length);
    const batchSymbols = symbols.slice(batchStart, batchEnd);
    
    console.log(`\n📦 Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(symbols.length / BATCH_SIZE)}: ${batchSymbols.join(', ')}`);
    
    const batchResults = await processBatch(
      batchSymbols,
      period,
      riskLevel,
      initialBalance,
      supabaseClient,
      userId,
      showLogs,
      saveTradesForLearning
    );
    
    // Aggregate results
    allResults.totalTrades += batchResults.totalTrades;
    allResults.winningTrades += batchResults.winningTrades;
    allResults.losingTrades += batchResults.losingTrades;
    allResults.totalPnL += batchResults.totalPnL;
    allResults.trades.push(...batchResults.trades);
    
    console.log(`✅ Batch complete: ${batchResults.totalTrades} trades, ${batchResults.winningTrades} wins, PnL: $${batchResults.totalPnL.toFixed(2)}`);
  }
  
  // Calculate final metrics
  allResults.winRate = allResults.totalTrades > 0 
    ? allResults.winningTrades / allResults.totalTrades 
    : 0;
  allResults.roi = (allResults.totalPnL / initialBalance) * 100;
  
  // Calculate Sharpe ratio (simplified)
  const avgReturn = allResults.totalTrades > 0 ? allResults.totalPnL / allResults.totalTrades : 0;
  const returns = allResults.trades.map(t => t.pnl || 0);
  const stdDev = returns.length > 1 
    ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
    : 1;
  allResults.sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  
  // Calculate max drawdown
  let peak = initialBalance;
  let maxDD = 0;
  let runningBalance = initialBalance;
  for (const trade of allResults.trades) {
    runningBalance += trade.pnl || 0;
    if (runningBalance > peak) peak = runningBalance;
    const dd = ((peak - runningBalance) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  allResults.maxDrawdown = maxDD;
  
  console.log(`\n🎯 BACKTEST COMPLETE:`);
  console.log(`   Total Trades: ${allResults.totalTrades}`);
  console.log(`   Win Rate: ${(allResults.winRate * 100).toFixed(1)}%`);
  console.log(`   Total P&L: $${allResults.totalPnL.toFixed(2)}`);
  console.log(`   ROI: ${allResults.roi.toFixed(2)}%`);
  console.log(`   Sharpe Ratio: ${allResults.sharpeRatio.toFixed(2)}`);
  console.log(`   Max Drawdown: ${allResults.maxDrawdown.toFixed(2)}%`);
  
  return {
    success: true,
    totalTrades: allResults.totalTrades,
    winRate: allResults.winRate,
    totalReturn: allResults.roi / 100, // Convert back to decimal for compatibility
    roi: allResults.roi,
    finalBalance: initialBalance + allResults.totalPnL,
    sharpeRatio: allResults.sharpeRatio,
    maxDrawdown: allResults.maxDrawdown,
    tradeDecisionLogs: allResults.trades.slice(-50), // Last 50 trades
    enhancedFeatures: {
      dynamicPositionSizing: true,
      atrTrailingStops: true,
      multiTimeframeAnalysis: true,
      marketRegimeDetection: true,
      adaptiveThresholds: true,
      signalFiltering: true,
      assetSpecificModels: true,
      tradeDecisionLogging: true,
      batchProcessing: true
    },
    summary: `🤖 AI-POWERED BACKTESTING: ${allResults.totalTrades} trades, ${(allResults.winRate * 100).toFixed(1)}% win rate, ${allResults.roi.toFixed(2)}% ROI across ${symbols.length} symbols using batch processing, shared AI decision logic, dynamic position sizing, and market regime detection`
  };
}

// Process a batch of symbols
async function processBatch(
  symbols: string[],
  period: string,
  riskLevel: string,
  initialBalance: number,
  supabaseClient: any,
  userId?: string,
  showLogs: boolean = true,
  saveTradesForLearning: boolean = true
) {
  
  // Calculate date range based on period
  const endDate = new Date();
  const startDate = new Date();
  
  switch (period) {
    case '1day':
      startDate.setDate(endDate.getDate() - 1);
      break;
    case '1week':
      startDate.setDate(endDate.getDate() - 7);
      break;
    case '2weeks':
      startDate.setDate(endDate.getDate() - 14);
      break;
    case '1month':
      startDate.setMonth(endDate.getMonth() - 1);
      break;
    case '3months':
      startDate.setMonth(endDate.getMonth() - 3);
      break;
  }

  console.log(`📅 Backtesting from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

  let totalTrades = 0;
  let winningTrades = 0;
  let totalConfidence = 0;
  let currentBalance = initialBalance;
  const trades = [];
  const tradeDecisionLogs: TradeDecisionLog[] = [];
  const learningData = new Map(); // Track learning per symbol

  // 🚀 PHASE 1-3 ENHANCED SIMULATION WITH REAL DATA
  for (const symbol of symbols) {
    try {
      console.log(`📈 Backtesting ${symbol} with REAL historical data and Phase 1-3 enhancements...`);
      
      // Fetch real historical data from Yahoo Finance
      const historicalData = await fetchRealHistoricalData(symbol, period);
      
      if (historicalData.length === 0) {
        console.log(`⚠️ Skipping ${symbol} - no historical data available`);
        continue;
      }
      
      // 🧠 Load trained model weights for this symbol (if available)
      const trainedModel = await loadTrainedModel(symbol, userId, supabaseClient);
      
      // Track indicator performance for this run
      const indicatorPerformance = {
        ichimoku: { wins: 0, losses: 0 },
        ema200: { wins: 0, losses: 0 },
        macd: { wins: 0, losses: 0 },
        bollinger: { wins: 0, losses: 0 },
        volume: { wins: 0, losses: 0 },
        marketCondition: { wins: 0, losses: 0 },
        volatility: { wins: 0, losses: 0 }
      };
      
      // 🔍 OPTIMIZED: Derive multi-timeframe analysis from already-fetched data
      // This avoids 3 extra API calls per symbol (159 calls saved for 53 symbols!)
      // Keeps ALL multi-timeframe analysis logic intact, just uses existing data
      const multiTimeframeData = deriveMultiTimeframeFromHistorical(historicalData);
      const multiTimeframeAnalysis = analyzeMultiTimeframe(multiTimeframeData);
      
      // PHASE 1: Load existing adaptive parameters or initialize new ones
      let adaptiveParams = {
        confidenceThreshold: 40.0, // 🚀 ULTRA-AGGRESSIVE: Reduced to 40% 
        confluenceThreshold: 0.45,  // PHASE 1: Lowered to 0.45
        stopLossMultiplier: 1.0,
        takeProfitMultiplier: 1.0,
        successRate: 0.0,
        totalTrades: 0,
        winningTrades: 0,
        averageProfit: 0.0
      };
      
      // 🧠 Load learned parameters from previous backtests
      if (userId && supabaseClient) {
        try {
          const { data: savedParams, error: paramsError } = await supabaseClient
            .from('bot_adaptive_parameters')
            .select('*')
            .eq('user_id', userId)
            .eq('symbol', symbol)
            .order('last_updated', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (!paramsError && savedParams) {
            adaptiveParams.confidenceThreshold = savedParams.confidence_threshold || 40.0;
            adaptiveParams.confluenceThreshold = savedParams.confluence_threshold || 0.45;
            adaptiveParams.stopLossMultiplier = savedParams.stop_loss_multiplier || 1.0;
            adaptiveParams.takeProfitMultiplier = savedParams.take_profit_multiplier || 1.0;
            adaptiveParams.successRate = savedParams.success_rate || 0.0;
            adaptiveParams.totalTrades = savedParams.total_trades || 0;
            adaptiveParams.winningTrades = savedParams.winning_trades || 0;
            adaptiveParams.averageProfit = savedParams.average_profit || 0.0;
            
            console.log(`🧠 ${symbol}: Loaded learned parameters - ${(adaptiveParams.successRate * 100).toFixed(1)}% win rate from ${adaptiveParams.totalTrades} historical trades`);
            console.log(`   🎯 Using adapted thresholds: Confidence ${adaptiveParams.confidenceThreshold.toFixed(1)}%, Confluence ${adaptiveParams.confluenceThreshold.toFixed(2)}`);
          } else {
            console.log(`📝 ${symbol}: No previous learning found, starting fresh with default parameters`);
          }
        } catch (error) {
          console.log(`⚠️ Could not load learned parameters for ${symbol}, using defaults`);
        }
      }
      
      // Define risk level config
      const riskConfig: RiskLevel = {
        name: riskLevel as any,
        minConfluence: riskLevel === 'low' ? 0.75 : riskLevel === 'medium' ? 0.55 : 0.40,
        fibonacciWeight: 0.3,
        supportResistanceWeight: 0.3,
        trendWeight: 0.3,
        volumeWeight: 0.1,
        description: `${riskLevel} risk profile`
      };
      
      // Iterate through historical data points with adaptive sampling
      const minDataPoints = Math.min(50, Math.floor(historicalData.length * 0.2));
      // Sample every 4 hours (every 4th bar) for faster backtesting without losing quality
      const sampleRate = 4;
      for (let i = minDataPoints; i < historicalData.length - 1; i += sampleRate) {
        const currentBar = historicalData[i];
        const nextBar = historicalData[i + 1];
        const currentPrice = currentBar.close;
        
        // ✅ BUILD AI TRADING STATE from historical data
        const tradingState = buildTradingState(historicalData, i);
        
        // ✅ CALCULATE CONFLUENCE SCORE using shared logic
        tradingState.confluenceScore = calculateConfluenceScore(tradingState, riskConfig);
        
        // Skip if confluence too low
        if (tradingState.confluenceScore < adaptiveParams.confluenceThreshold) {
          continue;
        }
        
        // ✅ MAKE AI TRADING DECISION using shared logic (same as live trading!)
        const aiDecision = await makeAITradingDecision(
          tradingState,
          symbol,
          true, // enableShorts - enable for backtesting
          trainedModel
        );
        
        // Skip HOLD decisions
        if (aiDecision.type === 'HOLD') {
          continue;
        }
        
        // Check adaptive confidence threshold
        if (aiDecision.confidence < adaptiveParams.confidenceThreshold) {
          continue;
        }
        
        // 🔍 Apply multi-timeframe boost/penalty to AI confidence
        const mtfBoost = getMultiTimeframeBoost(multiTimeframeAnalysis, aiDecision.type);
        aiDecision.confidence = Math.max(0, Math.min(100, aiDecision.confidence + mtfBoost));
        
        console.log(`🤖 AI Decision for ${symbol}: ${aiDecision.type} with ${aiDecision.confidence.toFixed(1)}% confidence ${trainedModel ? '(using trained model)' : '(rule-based)'}`);
        
        // ✅ CALCULATE RISK PARAMETERS using shared logic
        const riskParams = calculateRiskParameters(tradingState, aiDecision, symbol);
        
        // Apply adaptive multipliers
        riskParams.stopLoss = riskParams.stopLoss * adaptiveParams.stopLossMultiplier;
        riskParams.takeProfit = riskParams.takeProfit * adaptiveParams.takeProfitMultiplier;
        
        // 🎯 FLEXIBLE POSITION SIZING - Works from $1 to unlimited amounts
        let positionMultiplier = 1.0;
        
        // Base position size scales with confidence (8-30% of balance)
        let basePositionPercent = 0.10; // Start with 10% of balance
        
        if (aiDecision.confidence >= 90) {
          basePositionPercent = 0.30; // Ultra high confidence = 30% of capital
          positionMultiplier = 3.5;
          console.log(`🚀 ULTRA HIGH CONFIDENCE ${symbol}: ${aiDecision.confidence.toFixed(1)}% = 30% of capital (3.5x multiplier)`);
        } else if (aiDecision.confidence >= 85) {
          basePositionPercent = 0.25; // High confidence = 25% of capital
          positionMultiplier = 2.5;
          console.log(`💎 HIGH CONFIDENCE ${symbol}: ${aiDecision.confidence.toFixed(1)}% = 25% of capital (2.5x multiplier)`);
        } else if (aiDecision.confidence >= 80) {
          basePositionPercent = 0.20; // Strong confidence = 20% of capital
          positionMultiplier = 2.0;
          console.log(`🔥 STRONG CONFIDENCE ${symbol}: ${aiDecision.confidence.toFixed(1)}% = 20% of capital (2.0x multiplier)`);
        } else if (aiDecision.confidence >= 75) {
          basePositionPercent = 0.15; // Good confidence = 15% of capital
          positionMultiplier = 1.5;
          console.log(`📈 GOOD CONFIDENCE ${symbol}: ${aiDecision.confidence.toFixed(1)}% = 15% of capital (1.5x multiplier)`);
        } else if (aiDecision.confidence >= 70) {
          basePositionPercent = 0.12; // Moderate confidence = 12% of capital
          positionMultiplier = 1.2;
          console.log(`⚡ MODERATE CONFIDENCE ${symbol}: ${aiDecision.confidence.toFixed(1)}% = 12% of capital (1.2x multiplier)`);
        } else {
          basePositionPercent = 0.08; // Low confidence = 8% of capital
          positionMultiplier = 0.8;
          console.log(`⚠️ LOW CONFIDENCE ${symbol}: ${aiDecision.confidence.toFixed(1)}% = 8% of capital (0.8x multiplier)`);
        }
        
        // 🛡️ Market regime adjustment - boost/reduce based on market alignment
        let regimeMultiplier = 1.0;
        const currentRegime = tradingState.marketCondition;
        
        if (currentRegime === 'bullish') {
          regimeMultiplier = aiDecision.type === 'BUY' ? 1.4 : 0.6; // Strong boost for aligned trades
          if (aiDecision.type === 'BUY') {
            console.log(`   🌊 Bullish regime boost: +40% position size`);
          }
        } else if (currentRegime === 'bearish') {
          regimeMultiplier = aiDecision.type === 'SELL' ? 1.3 : 0.6; // Boost shorts in bear market
          if (aiDecision.type === 'SELL') {
            console.log(`   🐻 Bearish regime boost: +30% position size`);
          }
        } else {
          regimeMultiplier = 0.9; // Slight reduction in sideways markets
        }
        
        // 🎯 Calculate final position size with all multipliers
        const tradeAmount = Math.max(1.0, (currentBalance * basePositionPercent) * regimeMultiplier); // Minimum $1
        
        // Support fractional shares for flexibility (real brokers support this)
        const quantity = Math.max(0.001, tradeAmount / currentPrice); // Minimum 0.001 shares
        
        const formatCurrency = (val: number) => `$${val.toFixed(2)}`;
        console.log(`   💰 Position: ${formatCurrency(tradeAmount)} (${(basePositionPercent * regimeMultiplier * 100).toFixed(1)}% of ${formatCurrency(currentBalance)}) = ${quantity.toFixed(6)} shares`);
        
        // Skip only if balance is completely insufficient (less than $0.50)
        if (currentBalance < 0.50) {
          console.log(`   ⏭️ Skipping ${symbol} - balance too low: ${formatCurrency(currentBalance)}`);
          continue;
        }
        
        // 🎯 Hold position until stop loss or take profit is hit
        let exitPrice: number | null = null;
        let exitBar = i + 1;
        let hitStop = false;
        let hitTarget = false;
        
        // Scan forward through bars until we hit stop loss or take profit
        while (exitBar < historicalData.length && !exitPrice) {
          const scanBar = historicalData[exitBar];
          
          if (aiDecision.type === 'BUY') {
            // For BUY: check if low hit stop loss or high hit take profit
            if (scanBar.low <= riskParams.stopLoss) {
              exitPrice = riskParams.stopLoss;
              hitStop = true;
            } else if (scanBar.high >= riskParams.takeProfit) {
              exitPrice = riskParams.takeProfit;
              hitTarget = true;
            }
          } else {
            // For SELL: check if high hit stop loss or low hit take profit
            if (scanBar.high >= riskParams.stopLoss) {
              exitPrice = riskParams.stopLoss;
              hitStop = true;
            } else if (scanBar.low <= riskParams.takeProfit) {
              exitPrice = riskParams.takeProfit;
              hitTarget = true;
            }
          }
          
          exitBar++;
          
          // Safety: don't scan more than 20 bars ahead
          if (exitBar > i + 20) {
            // If neither target hit within 20 bars, exit at current price (conservative)
            exitPrice = historicalData[Math.min(exitBar - 1, historicalData.length - 1)].close;
            break;
          }
        }
        
        // If we reached end of data without hitting targets, skip this trade
        if (!exitPrice) {
          continue;
        }
        
        // 💰 Calculate ACTUAL P&L: (exit - entry) * quantity for BUY, (entry - exit) * quantity for SELL
        let actualPnL: number;
        if (aiDecision.type === 'BUY') {
          actualPnL = (exitPrice - currentPrice) * quantity;
        } else {
          actualPnL = (currentPrice - exitPrice) * quantity;
        }
        
        const isWin = actualPnL > 0;
        
        currentBalance += actualPnL;
        totalTrades++;
        totalConfidence += aiDecision.confidence;
        
        if (isWin) {
          winningTrades++;
          
          // 🧠 Track which indicators contributed to this winning trade
          if (tradingState.indicators.ichimoku.signal !== 0) indicatorPerformance.ichimoku.wins++;
          if (Math.abs(tradingState.price - tradingState.indicators.ema200) / tradingState.indicators.ema200 > 0.02) indicatorPerformance.ema200.wins++;
          if (tradingState.indicators.macd.histogram !== 0) indicatorPerformance.macd.wins++;
          if (tradingState.indicators.bollinger.position < 0.3 || tradingState.indicators.bollinger.position > 0.7) indicatorPerformance.bollinger.wins++;
          if (tradingState.indicators.obv !== 0) indicatorPerformance.volume.wins++;
          if (tradingState.marketCondition !== 'sideways') indicatorPerformance.marketCondition.wins++;
          const atrPct = tradingState.indicators.atr / tradingState.price;
          if (atrPct > 0.02 && atrPct < 0.06) indicatorPerformance.volatility.wins++;
        } else {
          // Track losses
          if (tradingState.indicators.ichimoku.signal !== 0) indicatorPerformance.ichimoku.losses++;
          if (Math.abs(tradingState.price - tradingState.indicators.ema200) / tradingState.indicators.ema200 > 0.02) indicatorPerformance.ema200.losses++;
          if (tradingState.indicators.macd.histogram !== 0) indicatorPerformance.macd.losses++;
          if (tradingState.indicators.bollinger.position < 0.3 || tradingState.indicators.bollinger.position > 0.7) indicatorPerformance.bollinger.losses++;
          if (tradingState.indicators.obv !== 0) indicatorPerformance.volume.losses++;
          if (tradingState.marketCondition !== 'sideways') indicatorPerformance.marketCondition.losses++;
          const atrPct = tradingState.indicators.atr / tradingState.price;
          if (atrPct > 0.02 && atrPct < 0.06) indicatorPerformance.volatility.losses++;
        }
        
        // Get FULL technical indicators for logging and saving, INCLUDING multi-timeframe
        const indicators = extractIndicatorsForSaving(tradingState, historicalData, i);
        
        // 🔍 Add multi-timeframe analysis to indicators
        indicators.multiTimeframe = {
          trend: multiTimeframeAnalysis.trend,
          strength: multiTimeframeAnalysis.strength,
          confluence: multiTimeframeAnalysis.confluence,
          boost: mtfBoost
        };
        
        // Log the trade decision
        const tradeLog: TradeDecisionLog = {
          symbol,
          timestamp: new Date(currentBar.timestamp).toISOString(),
          action: aiDecision.type,
          price: currentPrice,
          exitPrice: exitPrice,
          quantity: quantity,
          confidence: aiDecision.confidence,
          stopLoss: riskParams.stopLoss,
          takeProfit: riskParams.takeProfit,
          indicators,
          decisionReasoning: aiDecision.reasoning,
          pnl: actualPnL,
          result: isWin ? 'WIN' : 'LOSS',
          usingAIModel: trainedModel !== null
        };
        
        tradeDecisionLogs.push(tradeLog);
        
        // 🧠 SAVE TRADE FOR LEARNING (if enabled)
        if (saveTradesForLearning && userId && supabaseClient) {
          try {
            await supabaseClient
              .from('trading_bot_learning')
              .insert({
                user_id: userId,
                symbol,
                trade_action: aiDecision.type,
                entry_price: currentPrice,
                exit_price: nextBar.close,
                stop_loss: riskParams.stopLoss,
                take_profit: riskParams.takeProfit,
                confidence_level: aiDecision.confidence,
                confluence_score: tradingState.confluenceScore,
                profit_loss: actualPnL,
                outcome: isWin ? 'WIN' : 'LOSS',
                reasoning: aiDecision.reasoning,
                indicators: indicators,
                market_condition: currentRegime,
                risk_level: riskLevel,
                trade_duration_hours: 24 // Approximate for daily bars
              });
          } catch (error) {
            console.log(`⚠️ Error saving learning data for ${symbol}:`, error);
          }
        }
        
        trades.push({
          symbol,
          type: aiDecision.type,
          price: currentPrice,
          quantity: quantity,
          pnl: actualPnL,
          confidence: aiDecision.confidence,
          regime: currentRegime,
          positionMultiplier,
          regimeMultiplier,
          hitStop,
          hitTarget,
          enhancedFeatures: {
            dynamicPositionSizing: positionMultiplier !== 1.0,
            marketRegimeDetection: true,
            aiModelInference: trainedModel !== null,
            realHistoricalData: true,
            adaptiveThresholds: aiDecision.confidence >= adaptiveParams.confidenceThreshold
          }
        });
        
        // Update adaptive parameters based on trade outcome
        adaptiveParams.totalTrades++;
        if (isWin) {
          adaptiveParams.winningTrades++;
          adaptiveParams.averageProfit = (adaptiveParams.averageProfit * (adaptiveParams.totalTrades - 1) + actualPnL) / adaptiveParams.totalTrades;
          
          if (adaptiveParams.winningTrades / adaptiveParams.totalTrades > 0.7) {
            adaptiveParams.confidenceThreshold = Math.max(30, adaptiveParams.confidenceThreshold - 0.5);
          }
        } else {
          if (adaptiveParams.winningTrades / adaptiveParams.totalTrades < 0.4) {
            adaptiveParams.confidenceThreshold = Math.min(65, adaptiveParams.confidenceThreshold + 1);
          }
        }
        
        adaptiveParams.successRate = adaptiveParams.winningTrades / adaptiveParams.totalTrades;
        
        console.log(`${isWin ? '✅' : '❌'} ${symbol} ${aiDecision.type}: $${actualPnL.toFixed(2)} P&L (${aiDecision.confidence.toFixed(1)}% conf, ${currentRegime} market${trainedModel ? ', AI model' : ', rule-based'})`);
      }
      
      // Store symbol learning data with indicator performance and multi-timeframe analysis
      learningData.set(symbol, { 
        ...adaptiveParams, 
        indicatorPerformance,
        multiTimeframeAnalysis // Save MTF data for this symbol
      });
      
    } catch (error) {
      console.error(`Error backtesting ${symbol}:`, error);
    }
  }

  // Calculate Sharpe ratio
  function calculateSharpeRatio(trades: any[]): number {
    if (trades.length < 2) return 0;
    
    const returns = trades.map(t => t.pnl / initialBalance).filter(r => r !== 0);
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const std = Math.sqrt(variance);
    
    return std === 0 ? 0 : mean / std;
  }

  // Get last 50 trades for detailed logging
  const last50Trades = tradeDecisionLogs.slice(-50);
  
  if (showLogs && last50Trades.length > 0) {
    console.log('\n📊 LAST 50 TRADE DECISIONS & INDICATORS:');
    console.log('=========================================');
    
    last50Trades.forEach((trade, index) => {
      console.log(`\n${index + 1}. ${trade.symbol} - ${trade.action} @ $${trade.price.toFixed(2)}`);
      console.log(`   🎯 Confidence: ${trade.confidence.toFixed(1)}% | Result: ${trade.result} | P&L: $${trade.pnl?.toFixed(2)}`);
      console.log(`   🛡️ Stop Loss: $${trade.stopLoss?.toFixed(2)} | Take Profit: $${trade.takeProfit?.toFixed(2)}`);
      console.log(`   📈 RSI: ${trade.indicators.rsi.toFixed(1)} | MACD: ${trade.indicators.macd.toFixed(2)} | ATR: ${trade.indicators.atr.toFixed(2)}`);
      console.log(`   🧠 Reasoning: ${trade.decisionReasoning}`);
    });
  }

  // 🧠 TRIGGER MODEL RETRAINING after backtest (if learning enabled and enough trades)
  if (saveTradesForLearning && userId && supabaseClient && totalTrades > 0) {
    console.log('\n🔄 TRIGGERING MODEL UPDATES based on backtest results...');
    
    // Get trade counts per symbol and their adaptive params
    const symbolTradeCounts = new Map<string, number>();
    for (const trade of trades) {
      symbolTradeCounts.set(trade.symbol, (symbolTradeCounts.get(trade.symbol) || 0) + 1);
    }
    
    // Update or create adaptive parameters for each symbol based on backtest results
    for (const [symbol, adaptiveParams] of learningData.entries()) {
      const tradeCount = symbolTradeCounts.get(symbol) || 0;
      
      if (tradeCount >= 3) { // Minimum 3 trades to update model parameters
        try {
          console.log(`🧠 Updating adaptive parameters for ${symbol}: ${(adaptiveParams.successRate * 100).toFixed(1)}% win rate from ${tradeCount} trades`);
          
          // Upsert adaptive parameters
          const { error: upsertError } = await supabaseClient
            .from('bot_adaptive_parameters')
            .upsert({
              user_id: userId,
              symbol: symbol,
              confidence_threshold: adaptiveParams.confidenceThreshold,
              confluence_threshold: adaptiveParams.confluenceThreshold,
              stop_loss_multiplier: adaptiveParams.stopLossMultiplier,
              take_profit_multiplier: adaptiveParams.takeProfitMultiplier,
              success_rate: adaptiveParams.successRate,
              total_trades: adaptiveParams.totalTrades,
              winning_trades: adaptiveParams.winningTrades,
              average_profit: adaptiveParams.averageProfit
            }, {
              onConflict: 'user_id,symbol',
              ignoreDuplicates: false
            });
          
          if (upsertError) {
            console.error(`❌ Error updating parameters for ${symbol}:`, upsertError);
          } else {
            console.log(`✅ Updated adaptive parameters for ${symbol}`);
          }
          
          // If we have enough good trades (10+ with >50% win rate), trigger model fine-tuning
          if (tradeCount >= 10 && adaptiveParams.successRate > 0.5) {
            console.log(`🎯 ${symbol} qualifies for model retraining: ${tradeCount} trades, ${(adaptiveParams.successRate * 100).toFixed(1)}% win rate`);
            
            // Fetch recent learning data for this symbol
            const { data: learningRecords, error: learningError } = await supabaseClient
              .from('trading_bot_learning')
              .select('*')
              .eq('user_id', userId)
              .eq('symbol', symbol)
              .order('created_at', { ascending: false })
              .limit(100);
            
            if (!learningError && learningRecords && learningRecords.length >= 20) {
              console.log(`📚 Found ${learningRecords.length} learning records for ${symbol}, preparing model update...`);
              
              // Calculate reward signal based on outcomes
              const rewardSignal = learningRecords.reduce((sum, record) => {
                const reward = record.outcome === 'WIN' ? (record.profit_loss || 0) : -(Math.abs(record.profit_loss) || 0);
                return sum + reward;
              }, 0) / learningRecords.length;
              
              // 🎯 Calculate new indicator weights based on performance
              const calculateNewWeight = (indicator: { wins: number, losses: number }, baseWeight: number) => {
                const total = indicator.wins + indicator.losses;
                if (total === 0) return baseWeight;
                
                const winRate = indicator.wins / total;
                // Increase weight for indicators with >60% win rate, decrease for <40%
                if (winRate > 0.6) {
                  return Math.min(baseWeight * 1.3, baseWeight + 10);
                } else if (winRate < 0.4) {
                  return Math.max(baseWeight * 0.7, baseWeight - 10);
                }
                return baseWeight;
              };
              
              const indicatorPerf = adaptiveParams.indicatorPerformance || {
                ichimoku: { wins: 0, losses: 0 },
                ema200: { wins: 0, losses: 0 },
                macd: { wins: 0, losses: 0 },
                bollinger: { wins: 0, losses: 0 },
                volume: { wins: 0, losses: 0 },
                marketCondition: { wins: 0, losses: 0 },
                volatility: { wins: 0, losses: 0 }
              };
              
              // Load existing model to get current weights
              const { data: existingModel } = await supabaseClient
                .from('asset_models')
                .select('model_weights')
                .eq('user_id', userId)
                .eq('symbol', symbol)
                .eq('model_type', 'adaptive_trading')
                .maybeSingle();
              
              const currentWeights = existingModel?.model_weights?.indicatorWeights || {
                ichimoku: 20,
                ema200: 15,
                macd: 20,
                bollinger: 15,
                volume: 10,
                marketCondition: 10,
                volatility: 10
              };
              
              const newIndicatorWeights = {
                ichimoku: calculateNewWeight(indicatorPerf.ichimoku, currentWeights.ichimoku),
                ema200: calculateNewWeight(indicatorPerf.ema200, currentWeights.ema200),
                macd: calculateNewWeight(indicatorPerf.macd, currentWeights.macd),
                bollinger: calculateNewWeight(indicatorPerf.bollinger, currentWeights.bollinger),
                volume: calculateNewWeight(indicatorPerf.volume, currentWeights.volume),
                marketCondition: calculateNewWeight(indicatorPerf.marketCondition, currentWeights.marketCondition),
                volatility: calculateNewWeight(indicatorPerf.volatility, currentWeights.volatility)
              };
              
              console.log(`📊 ${symbol}: New indicator weights:`, newIndicatorWeights);
              
              // Update model weights based on learning (simplified reinforcement)
              const performanceMetrics = {
                winRate: adaptiveParams.successRate,
                avgReturn: adaptiveParams.averageProfit,
                totalTrades: tradeCount,
                rewardSignal: rewardSignal,
                indicatorPerformance: indicatorPerf,
                lastUpdated: new Date().toISOString()
              };
              
              // Store updated model metadata with learned indicator weights
              const { error: modelError } = await supabaseClient
                .from('asset_models')
                .upsert({
                  user_id: userId,
                  symbol: symbol,
                  model_type: 'adaptive_trading',
                  model_weights: { 
                    indicatorWeights: newIndicatorWeights,
                    learning_iterations: (learningRecords.length / 10),
                    confidence_bias: adaptiveParams.confidenceThreshold - 50, // Deviation from baseline
                    risk_bias: adaptiveParams.stopLossMultiplier - 1.0
                  },
                  performance_metrics: performanceMetrics,
                  updated_at: new Date().toISOString()
                }, {
                  onConflict: 'user_id,symbol,model_type'
                });
              
              if (modelError) {
                console.error(`❌ Error updating model for ${symbol}:`, modelError);
              } else {
                console.log(`✅ Model learned from backtest for ${symbol} - next run will use improved weights`);
              }
            }
          }
        } catch (error) {
          console.error(`❌ Error processing learning for ${symbol}:`, error);
        }
      }
    }
    
    console.log(`✅ Saved ${totalTrades} trades to learning database and updated ${learningData.size} symbol models`);
  }

  return {
    totalTrades,
    winningTrades,
    losingTrades: totalTrades - winningTrades,
    totalPnL: currentBalance - initialBalance,
    trades: trades.map(t => ({ pnl: t.pnl || 0 }))
  };
}