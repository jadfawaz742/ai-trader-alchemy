// ============================================
// Symbol Detection & Conversion Utilities
// ============================================

// List of common crypto symbols
const CRYPTO_SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'AVAX', 'MATIC', 'UNI', 'AAVE', 'LINK',
  'XRP', 'DOGE', 'SHIB', 'LTC', 'BCH', 'ATOM', 'ALGO', 'XLM', 'VET', 'FIL',
  'MEME', 'PEPE', 'BONK', 'WIF'
];

/**
 * Detect if a symbol represents a cryptocurrency
 * @param symbol - Trading symbol (e.g., BTC-USD, BTCUSDT, AAPL)
 * @returns true if crypto, false if stock
 */
export function isCryptoSymbol(symbol: string): boolean {
  // Check if symbol contains any crypto ticker
  const hasCryptoTicker = CRYPTO_SYMBOLS.some(crypto => symbol.toUpperCase().includes(crypto));
  
  // Check for common crypto formats
  const hasCryptoFormat = symbol.endsWith('-USD') || 
                          symbol.includes('USDT') || 
                          symbol.includes('USDC') ||
                          symbol.endsWith('-PERP');
  
  return hasCryptoTicker || hasCryptoFormat;
}

/**
 * Convert symbol to Bybit API format
 * @param symbol - Trading symbol (e.g., BTC-USD, ETH-USD)
 * @returns Bybit format symbol (e.g., BTCUSDT, ETHUSDT)
 */
export function convertToBybitFormat(symbol: string): string {
  // BTC-USD → BTCUSDT
  if (symbol.endsWith('-USD')) {
    return symbol.replace('-USD', 'USDT');
  }
  
  // Already in Bybit format (BTCUSDT)
  if (symbol.includes('USDT')) {
    return symbol;
  }
  
  // Fallback: append USDT
  return `${symbol}USDT`;
}

/**
 * Convert symbol to Yahoo Finance format
 * @param symbol - Trading symbol
 * @returns Yahoo Finance format symbol
 */
export function convertToYahooFormat(symbol: string): string {
  // Already in Yahoo format
  if (symbol.includes('-') || !symbol.includes('USDT')) {
    return symbol;
  }
  
  // BTCUSDT → BTC-USD
  if (symbol.includes('USDT')) {
    return symbol.replace('USDT', '-USD');
  }
  
  return symbol;
}

/**
 * Get human-readable asset type
 */
export function getAssetType(symbol: string): 'crypto' | 'stock' {
  return isCryptoSymbol(symbol) ? 'crypto' : 'stock';
}
