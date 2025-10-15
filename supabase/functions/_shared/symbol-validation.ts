/**
 * Symbol Validation Utility
 * Validates if symbols are supported on Bybit for trading
 */

export interface SymbolValidationResult {
  symbol: string;
  isValid: boolean;
  reason?: string;
  broker?: string;
}

const BYBIT_API_BASE = 'https://api.bybit.com';

/**
 * Fetch all supported spot trading symbols from Bybit
 */
export async function fetchBybitSupportedSymbols(): Promise<Set<string>> {
  try {
    const response = await fetch(`${BYBIT_API_BASE}/v5/market/instruments-info?category=spot&limit=1000`);
    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }
    
    const symbols = new Set<string>();
    if (data.result?.list) {
      for (const instrument of data.result.list) {
        if (instrument.status === 'Trading') {
          symbols.add(instrument.symbol);
        }
      }
    }
    
    console.log(`✅ Loaded ${symbols.size} tradeable symbols from Bybit`);
    return symbols;
  } catch (error) {
    console.error('❌ Failed to fetch Bybit symbols:', error);
    return new Set();
  }
}

/**
 * Validate a batch of symbols against Bybit's supported list
 */
export async function validateSymbols(symbols: string[]): Promise<SymbolValidationResult[]> {
  const supportedSymbols = await fetchBybitSupportedSymbols();
  
  const results: SymbolValidationResult[] = symbols.map(symbol => {
    const isValid = supportedSymbols.has(symbol);
    return {
      symbol,
      isValid,
      reason: isValid ? undefined : 'Symbol not supported on Bybit',
      broker: 'bybit'
    };
  });
  
  const validCount = results.filter(r => r.isValid).length;
  const invalidCount = results.length - validCount;
  
  console.log(`📊 Validation results: ${validCount} valid, ${invalidCount} invalid symbols`);
  
  return results;
}

/**
 * Filter symbols to only include those supported on Bybit
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
  const supportedSymbols = await fetchBybitSupportedSymbols();
  return supportedSymbols.has(symbol);
}
