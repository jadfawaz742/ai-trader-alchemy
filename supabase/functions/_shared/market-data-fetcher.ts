// ============================================
// Unified Market Data Fetcher
// Routes to Binance (crypto) or Yahoo Finance (stocks)
// ============================================

import { isCryptoSymbol, convertToBinanceFormat } from './symbol-utils.ts';

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
 * Fetch market data from appropriate source (Binance for crypto, Yahoo for stocks)
 */
export async function fetchMarketData(options: MarketDataOptions): Promise<MarketDataPoint[]> {
  const dataSource = isCryptoSymbol(options.symbol) ? 'Binance' : 'Yahoo Finance';
  console.log(`📊 Fetching ${options.symbol} from ${dataSource} (${options.range}, ${options.interval})`);
  
  try {
    if (isCryptoSymbol(options.symbol)) {
      return await fetchBinanceData(options);
    } else {
      return await fetchYahooFinanceData(options);
    }
  } catch (error) {
    console.error(`❌ Error fetching from ${dataSource}:`, error);
    throw error;
  }
}

/**
 * Fetch cryptocurrency data from Binance API
 */
async function fetchBinanceData(options: MarketDataOptions): Promise<MarketDataPoint[]> {
  const binanceSymbol = convertToBinanceFormat(options.symbol);
  
  // Map interval to Binance format
  const intervalMap: Record<string, string> = {
    '1d': '1d',
    '4h': '4h',
    '1h': '1h',
    '30m': '30m',
    '15m': '15m',
    '5m': '5m'
  };
  const interval = intervalMap[options.interval] || '1d';
  
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
  
  // Binance allows up to 1000 klines per request
  const limit = 1000;
  
  const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=${limit}`;
  
  console.log(`   Binance URL: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Binance API error: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!Array.isArray(data) || data.length === 0) {
    console.log(`⚠️ No data returned from Binance for ${binanceSymbol}`);
    return [];
  }
  
  // Convert Binance format to standard format
  // Binance returns: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, ...]
  const historicalData = data.map((candle: any[]) => ({
    timestamp: parseInt(candle[0]),
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5])
  }));
  
  console.log(`✅ Fetched ${historicalData.length} candles from Binance`);
  return historicalData;
}

/**
 * Fetch current spot price for a symbol
 */
export async function fetchCurrentPrice(symbol: string): Promise<number> {
  console.log(`💰 Fetching current price for ${symbol}`);
  
  try {
    if (isCryptoSymbol(symbol)) {
      const binanceSymbol = convertToBinanceFormat(symbol);
      const url = `https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }
      
      const data = await response.json();
      const price = parseFloat(data.price);
      console.log(`✅ ${symbol} current price: $${price}`);
      return price;
    } else {
      // For stocks, use Yahoo Finance quote endpoint
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (!response.ok) {
        throw new Error(`Yahoo Finance API error: ${response.status}`);
      }
      
      const data = await response.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      
      if (!price) {
        throw new Error('No price data available');
      }
      
      console.log(`✅ ${symbol} current price: $${price}`);
      return price;
    }
  } catch (error) {
    console.error(`❌ Error fetching current price for ${symbol}:`, error);
    throw error;
  }
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
