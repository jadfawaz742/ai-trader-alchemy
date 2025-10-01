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

interface MarketActivityFeedProps {
  isActive: boolean;
}

export const MarketActivityFeed: React.FC<MarketActivityFeedProps> = ({ isActive }) => {
  const [cryptoPrices, setCryptoPrices] = useState<CryptoPrice[]>([]);

  useEffect(() => {
    if (!isActive) return;

    const fetchPrices = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('fetch-crypto-prices');
        
        if (error) {
          console.error('Error fetching crypto prices:', error);
          return;
        }

        if (data?.success && data?.prices) {
          setCryptoPrices(data.prices);
        }
      } catch (error) {
        console.error('Error fetching crypto prices:', error);
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
  );
};