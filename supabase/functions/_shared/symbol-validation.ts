/**
 * Symbol Validation Utility
 * Validates if symbols are supported on Binance for trading
 */

export interface SymbolValidationResult {
  symbol: string;
  isValid: boolean;
  reason?: string;
  broker?: string;
}

const BINANCE_API_BASE = 'https://api.binance.com';

/**
 * Fetch all supported spot trading symbols from Binance
 */
export async function fetchBinanceSupportedSymbols(): Promise<Set<string>> {
  try {
    const response = await fetch(`${BINANCE_API_BASE}/api/v3/exchangeInfo`);
    const data = await response.json();
    
    if (!data.symbols) {
      throw new Error('Binance API error: No symbols returned');
    }
    
    const symbols = new Set<string>();
    for (const symbol of data.symbols) {
      // Only include USDT pairs that are actively trading
      if (symbol.quoteAsset === 'USDT' && symbol.status === 'TRADING') {
        symbols.add(symbol.symbol);
      }
    }
    
    console.log(`✅ Loaded ${symbols.size} tradeable symbols from Binance`);
    return symbols;
  } catch (error) {
    console.error('❌ Failed to fetch Binance symbols:', error);
    return new Set();
  }
}

/**
 * Validate a batch of symbols against Binance's supported list
 */
export async function validateSymbols(symbols: string[]): Promise<SymbolValidationResult[]> {
  const supportedSymbols = await fetchBinanceSupportedSymbols();
  
  const results: SymbolValidationResult[] = symbols.map(symbol => {
    const isValid = supportedSymbols.has(symbol);
    return {
      symbol,
      isValid,
      reason: isValid ? undefined : 'Symbol not supported on Binance',
      broker: 'binance'
    };
  });
  
  const validCount = results.filter(r => r.isValid).length;
  const invalidCount = results.length - validCount;
  
  console.log(`📊 Validation results: ${validCount} valid, ${invalidCount} invalid symbols`);
  
  return results;
}

/**
 * Filter symbols to only include those supported on Binance
 */
export async function filterValidSymbols(symbols: string[]): Promise<string[]> {
  const validationResults = await validateSymbols(symbols);
  return validationResults
    .filter(r => r.isValid)
    .map(r => r.symbol);
}

/**
 * Check if a single symbol is supported
 */
export async function isSymbolSupported(symbol: string): Promise<boolean> {
  const supportedSymbols = await fetchBinanceSupportedSymbols();
  return supportedSymbols.has(symbol);
}
