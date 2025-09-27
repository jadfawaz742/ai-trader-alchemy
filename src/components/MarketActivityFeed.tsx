import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react';

interface MarketActivity {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'ALERT';
  price: number;
  change: number;
  volume: string;
  timestamp: Date;
  reason: string;
}

interface MarketActivityFeedProps {
  isActive: boolean;
}

export const MarketActivityFeed: React.FC<MarketActivityFeedProps> = ({ isActive }) => {
  const [activities, setActivities] = useState<MarketActivity[]>([]);

  useEffect(() => {
    if (!isActive) return;

    const generateActivity = () => {
      // Use the same expanded symbol list as PPO training
      const symbols = [
        // Major US Tech Stocks
        'AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'META', 'AMZN', 'NFLX',
        // Other Major Stocks  
        'JPM', 'JNJ', 'PG', 'V', 'WMT', 'UNH', 'HD',
        // ETFs
        'SPY', 'QQQ', 'IWM', 'VTI',
        // Major Cryptocurrencies
        'BTCUSD', 'ETHUSD', 'SOLUSDT', 'ADAUSDT', 'DOTUSDT'
      ];
      const actions = ['BUY', 'SELL', 'ALERT'] as const;
      const reasons = [
        'Strong momentum detected',
        'Breakout pattern identified',
        'Volume spike noticed',
        'Technical indicator alignment',
        'Market sentiment shift',
        'Resistance level tested',
        'Support level holding',
        'Moving average crossover'
      ];

      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      const action = actions[Math.floor(Math.random() * actions.length)];
      
      // Enhanced price generation based on asset type
      let basePrice;
      if (symbol.includes('USD')) {
        // Cryptocurrencies
        basePrice = symbol === 'BTCUSD' ? 42000 + Math.random() * 8000 :
                   symbol === 'ETHUSD' ? 2200 + Math.random() * 600 :
                   symbol === 'SOLUSDT' ? 80 + Math.random() * 40 :
                   symbol === 'ADAUSDT' ? 0.35 + Math.random() * 0.15 :
                   0.25 + Math.random() * 0.15; // DOTUSDT
      } else if (['SPY', 'QQQ', 'IWM', 'VTI'].includes(symbol)) {
        // ETFs
        basePrice = symbol === 'SPY' ? 420 + Math.random() * 60 :
                   symbol === 'QQQ' ? 350 + Math.random() * 50 :
                   symbol === 'IWM' ? 180 + Math.random() * 40 :
                   220 + Math.random() * 40; // VTI
      } else {
        // Stocks - realistic price ranges
        const stockPrices = {
          'NVDA': 850 + Math.random() * 100,
          'GOOGL': 135 + Math.random() * 20,
          'TSLA': 240 + Math.random() * 40,
          'AAPL': 170 + Math.random() * 20,
          'MSFT': 330 + Math.random() * 30,
          'META': 295 + Math.random() * 30,
          'AMZN': 125 + Math.random() * 15,
          'NFLX': 450 + Math.random() * 50,
          'JPM': 140 + Math.random() * 20,
          'JNJ': 160 + Math.random() * 15,
          'PG': 150 + Math.random() * 10,
          'V': 250 + Math.random() * 25,
          'WMT': 155 + Math.random() * 10,
          'UNH': 520 + Math.random() * 40,
          'HD': 320 + Math.random() * 30
        };
        basePrice = stockPrices[symbol as keyof typeof stockPrices] || 150 + Math.random() * 200;
      }
      
      const change = (Math.random() - 0.5) * (symbol.includes('USD') ? 8 : 5); // Higher volatility for crypto
      
      const newActivity: MarketActivity = {
        id: Math.random().toString(36).substr(2, 9),
        symbol,
        action,
        price: Number(basePrice.toFixed(2)),
        change: Number(change.toFixed(2)),
        volume: `${(Math.random() * 9 + 1).toFixed(1)}M`,
        timestamp: new Date(),
        reason: reasons[Math.floor(Math.random() * reasons.length)]
      };

      setActivities(prev => [newActivity, ...prev.slice(0, 19)]); // Keep last 20 activities
    };

    // Generate initial activity
    generateActivity();
    
    const interval = setInterval(generateActivity, 2000 + Math.random() * 3000); // Every 2-5 seconds

    return () => clearInterval(interval);
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
          <Activity className="h-4 w-4 animate-pulse" />
          Live Market Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {activities.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span>Monitoring market activity...</span>
              </div>
            </div>
          ) : (
            activities.map((activity) => (
              <div 
                key={activity.id} 
                className="flex items-center justify-between p-3 border rounded-lg bg-muted/20 hover:bg-muted/40 transition-all duration-300 animate-in slide-in-from-top"
              >
                <div className="flex items-center gap-3">
                  <Badge 
                    variant={
                      activity.action === 'BUY' ? 'default' : 
                      activity.action === 'SELL' ? 'destructive' : 'secondary'
                    }
                    className="min-w-[50px] justify-center"
                  >
                    {activity.action}
                  </Badge>
                  
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{activity.symbol}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(activity.price)}
                      </span>
                      <div className={`flex items-center gap-1 text-xs ${
                        activity.change >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {activity.change >= 0 ? 
                          <TrendingUp className="h-3 w-3" /> : 
                          <TrendingDown className="h-3 w-3" />
                        }
                        {activity.change >= 0 ? '+' : ''}{activity.change.toFixed(2)}%
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {activity.reason}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Zap className="h-3 w-3" />
                    {activity.volume}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {activity.timestamp.toLocaleTimeString()}
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