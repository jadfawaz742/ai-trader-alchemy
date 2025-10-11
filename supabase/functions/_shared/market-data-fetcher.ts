// ============================================
// Unified Market Data Fetcher
// Routes to Bybit (crypto) or Yahoo Finance (stocks)
// ============================================

import { isCryptoSymbol, convertToBybitFormat } from './symbol-utils.ts';

export interface MarketDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataOptions {
  symbol: string;
  range: string;      // '6mo', '1y', '2y', '3mo', '1mo', '1week', '1day', '2weeks'
  interval: string;   // '1d', '4h', '1h', '30m', '15m', '5m'
}

/**
 * Fetch market data from appropriate source (Bybit for crypto, Yahoo for stocks)
 */
export async function fetchMarketData(options: MarketDataOptions): Promise<MarketDataPoint[]> {
  const dataSource = isCryptoSymbol(options.symbol) ? 'Bybit' : 'Yahoo Finance';
  console.log(`📊 Fetching ${options.symbol} from ${dataSource} (${options.range}, ${options.interval})`);
  
  try {
    if (isCryptoSymbol(options.symbol)) {
      return await fetchBybitData(options);
    } else {
      return await fetchYahooFinanceData(options);
    }
  } catch (error) {
    console.error(`❌ Error fetching from ${dataSource}:`, error);
    throw error;
  }
}

/**
 * Fetch cryptocurrency data from Bybit API
 */
async function fetchBybitData(options: MarketDataOptions): Promise<MarketDataPoint[]> {
  const bybitSymbol = convertToBybitFormat(options.symbol);
  
  // Map interval to Bybit format
  const intervalMap: Record<string, string> = {
    '1d': 'D',
    '4h': '240',
    '1h': '60',
    '30m': '30',
    '15m': '15',
    '5m': '5'
  };
  const interval = intervalMap[options.interval] || 'D';
  
  // Calculate time range in milliseconds
  const rangeMs: Record<string, number> = {
    '1day': 1 * 24 * 60 * 60 * 1000,
    '1week': 7 * 24 * 60 * 60 * 1000,
    '2weeks': 14 * 24 * 60 * 60 * 1000,
    '1mo': 30 * 24 * 60 * 60 * 1000,
    '3mo': 90 * 24 * 60 * 60 * 1000,
    '6mo': 180 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000,
    '2y': 730 * 24 * 60 * 60 * 1000
  };
  
  const timeRangeMs = rangeMs[options.range] || rangeMs['3mo'];
  const endTime = Date.now();
  const startTime = endTime - timeRangeMs;
  
  // Determine appropriate limit based on interval and range
  let limit = 1000; // Max allowed by Bybit
  if (options.interval === '5m' || options.interval === '15m') {
    limit = 1000; // Use max for short intervals
  }
  
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=${interval}&start=${startTime}&end=${endTime}&limit=${limit}`;
  
  console.log(`   Bybit URL: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Bybit API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg}`);
  }
  
  if (!data.result?.list || data.result.list.length === 0) {
    console.log(`⚠️ No data returned from Bybit for ${bybitSymbol}`);
    return [];
  }
  
  // Convert Bybit format to standard format (reverse for chronological order)
  const historicalData = data.result.list.reverse().map((candle: any[]) => ({
    timestamp: parseInt(candle[0]),
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5])
  }));
  
  console.log(`✅ Fetched ${historicalData.length} candles from Bybit`);
  return historicalData;
}

/**
 * Fetch stock data from Yahoo Finance API
 */
async function fetchYahooFinanceData(options: MarketDataOptions): Promise<MarketDataPoint[]> {
  // Map our range format to Yahoo Finance format
  const rangeMap: Record<string, string> = {
    '1day': '5d',
    '1week': '1mo',
    '2weeks': '1mo',
    '1mo': '3mo',
    '3mo': '6mo',
    '6mo': '6mo',
    '1y': '1y',
    '2y': '2y'
  };
  const yahooRange = rangeMap[options.range] || '6mo';
  
  // Map our interval to Yahoo Finance format
  const intervalMap: Record<string, string> = {
    '1d': '1d',
    '4h': '1h',  // Yahoo doesn't have 4h, use 1h
    '1h': '1h',
    '30m': '30m',
    '15m': '15m',
    '5m': '5m'
  };
  const yahooInterval = intervalMap[options.interval] || '1d';
  
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${options.symbol}?range=${yahooRange}&interval=${yahooInterval}`;
  
  console.log(`   Yahoo URL: ${url}`);
  
  // Retry logic for Yahoo Finance (can be flaky)
  let attempts = 0;
  let data;
  
  while (attempts < 2) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      if (!response.ok) {
        if (attempts === 0) {
          console.log(`⚠️ Yahoo Finance attempt 1 failed, retrying...`);
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
        console.log(`⚠️ Yahoo Finance error, retrying...`);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
  }
  
  const result = data?.chart?.result?.[0];
  if (!result) {
    throw new Error('No data returned from Yahoo Finance');
  }
  
  const timestamps = result.timestamp;
  const quotes = result.indicators.quote[0];
  
  if (!timestamps || !quotes) {
    throw new Error('Invalid data format from Yahoo Finance');
  }
  
  // Format historical data
  const historicalData: MarketDataPoint[] = [];
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
  
  console.log(`✅ Fetched ${historicalData.length} candles from Yahoo Finance`);
  return historicalData;
}
