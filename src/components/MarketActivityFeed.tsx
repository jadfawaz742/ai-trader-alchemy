import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

interface StockPrice {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
}

interface MarketActivityFeedProps {
  isActive: boolean;
}

export const MarketActivityFeed: React.FC<MarketActivityFeedProps> = ({ isActive }) => {
  const [cryptoPrices, setCryptoPrices] = useState<CryptoPrice[]>([]);
  const [stockPrices, setStockPrices] = useState<StockPrice[]>([]);
  
  const stockSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'NVDA'];

  useEffect(() => {
    if (!isActive) return;

    const fetchPrices = async () => {
      try {
        // Fetch crypto prices
        const { data: cryptoData, error: cryptoError } = await supabase.functions.invoke('fetch-crypto-prices');
        
        if (cryptoError) {
          console.error('Error fetching crypto prices:', cryptoError);
        } else if (cryptoData?.success && cryptoData?.prices) {
          setCryptoPrices(cryptoData.prices);
        }

        // Fetch stock prices
        const stockResults = await Promise.all(
          stockSymbols.map(async (symbol) => {
            try {
              const { data, error } = await supabase.functions.invoke('fetch-stock-price', {
                body: { symbol }
              });
              
              if (error || !data) {
                console.error(`Error fetching ${symbol}:`, error);
                return null;
              }
              
              return data as StockPrice;
            } catch (err) {
              console.error(`Error fetching ${symbol}:`, err);
              return null;
            }
          })
        );
        
        setStockPrices(stockResults.filter((r): r is StockPrice => r !== null));
      } catch (error) {
        console.error('Error fetching prices:', error);
      }
    };

    fetchPrices();
    const priceInterval = setInterval(fetchPrices, 30000); // Update every 30 seconds

    return () => clearInterval(priceInterval);
  }, [isActive]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  if (!isActive) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Live Stock Prices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {stockPrices.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>Loading stock prices from Yahoo Finance...</span>
                </div>
              </div>
            ) : (
              stockPrices.map((stock) => (
                <div 
                  key={stock.symbol} 
                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/20 hover:bg-muted/40 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{stock.symbol}</span>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(stock.price)}
                        </span>
                        <div className={`flex items-center gap-1 text-xs ${
                          stock.changePercent >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {stock.changePercent >= 0 ? 
                            <TrendingUp className="h-3 w-3" /> : 
                            <TrendingDown className="h-3 w-3" />
                          }
                          {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        High: {formatCurrency(stock.high)} | Low: {formatCurrency(stock.low)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">
                      Vol: {(stock.volume / 1000000).toFixed(1)}M
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Live Crypto Prices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {cryptoPrices.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span>Loading crypto prices from Bybit...</span>
                </div>
              </div>
            ) : (
              cryptoPrices.map((crypto) => (
                <div 
                  key={crypto.symbol} 
                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/20 hover:bg-muted/40 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{crypto.symbol}</span>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(crypto.price)}
                        </span>
                        <div className={`flex items-center gap-1 text-xs ${
                          crypto.change24h >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {crypto.change24h >= 0 ? 
                            <TrendingUp className="h-3 w-3" /> : 
                            <TrendingDown className="h-3 w-3" />
                          }
                          {crypto.change24h >= 0 ? '+' : ''}{crypto.change24h.toFixed(2)}%
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        24h High: {formatCurrency(crypto.high24h)} | Low: {formatCurrency(crypto.low24h)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">
                      Vol: {(crypto.volume24h / 1000000).toFixed(1)}M
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};