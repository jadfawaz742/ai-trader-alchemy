import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { usePortfolio } from '@/hooks/usePortfolio';
import { Activity, Bot, TrendingUp, TrendingDown, Zap, Eye, Play, Square } from 'lucide-react';

interface LiveTrade {
  symbol: string;
  action: string;
  quantity: number;
  price: number;
  confidence: number;
  reason: string;
  profitLoss: number;
  simulation: boolean;
  timestamp: string;
}

interface MarketFluctuation {
  symbol: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  timestamp: string;
}

export const LiveTradingView: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);
  const [marketData, setMarketData] = useState<MarketFluctuation[]>([]);
  const [totalPnL, setTotalPnL] = useState(0);
  const [botStatus, setBotStatus] = useState<'idle' | 'analyzing' | 'trading'>('idle');
  const { portfolio, updateBalance } = usePortfolio();

  // Simulate live market data updates
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'META', 'AMZN'];
        const newMarketData: MarketFluctuation[] = symbols.map(symbol => {
        const basePrice = 100 + (symbol.charCodeAt(0) % 100);
        const volatility = 0.02 + (Math.random() * 0.03);
        const priceChange = (Math.random() - 0.5) * volatility * basePrice;
        const currentPrice = basePrice + priceChange;
        const priceChangePercent = (priceChange / basePrice) * 100;
        
        let trend: 'bullish' | 'bearish' | 'neutral';
        if (priceChangePercent > 0.5) {
          trend = 'bullish';
        } else if (priceChangePercent < -0.5) {
          trend = 'bearish';
        } else {
          trend = 'neutral';
        }
        
        return {
          symbol,
          currentPrice: Number(currentPrice.toFixed(2)),
          priceChange: Number(priceChange.toFixed(2)),
          priceChangePercent: Number(priceChangePercent.toFixed(2)),
          trend,
          timestamp: new Date().toISOString()
        };
      });
      
      setMarketData(newMarketData);
      
      // Simulate bot reactions
      if (Math.random() > 0.7) { // 30% chance per update
        setBotStatus('analyzing');
        setTimeout(() => {
          if (Math.random() > 0.5) { // 50% chance to execute trade after analysis
            setBotStatus('trading');
            simulateTrade(newMarketData);
            setTimeout(() => setBotStatus('idle'), 2000);
          } else {
            setBotStatus('idle');
          }
        }, 1500);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isActive]);

  const simulateTrade = async (currentMarketData: MarketFluctuation[]) => {
    const tradableStock = currentMarketData[Math.floor(Math.random() * currentMarketData.length)];
    const action = Math.random() > 0.6 ? 'BUY' : Math.random() > 0.3 ? 'SELL' : 'HOLD';
    
    if (action === 'HOLD') return;

    const quantity = Math.floor(Math.random() * 10) + 1;
    const confidence = 60 + Math.random() * 35; // 60-95% confidence
    const profitLoss = (Math.random() - 0.3) * 200; // Slightly positive bias
    
    const newTrade: LiveTrade = {
      symbol: tradableStock.symbol,
      action,
      quantity,
      price: tradableStock.currentPrice,
      confidence: Number(confidence.toFixed(1)),
      reason: `${tradableStock.trend} signal detected with ${confidence.toFixed(1)}% confidence`,
      profitLoss: Number(profitLoss.toFixed(2)),
      simulation: true,
      timestamp: new Date().toISOString()
    };

    setLiveTrades(prev => [newTrade, ...prev.slice(0, 9)]); // Keep last 10 trades
    setTotalPnL(prev => prev + profitLoss);

    // Update portfolio balance if it's a significant profit/loss
    if (portfolio && Math.abs(profitLoss) > 10) {
      const newBalance = portfolio.current_balance + profitLoss;
      await updateBalance(newBalance);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'bullish') return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend === 'bearish') return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Activity className="h-4 w-4 text-yellow-500" />;
  };

  const getBotStatusColor = (status: string) => {
    if (status === 'analyzing') return 'text-yellow-500';
    if (status === 'trading') return 'text-green-500';
    return 'text-muted-foreground';
  };

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                AI Trading Bot - Live Market View
              </CardTitle>
              <CardDescription>
                Watch live market fluctuations and real trading execution
              </CardDescription>
            </div>
            <Button
              onClick={() => setIsActive(!isActive)}
              variant={isActive ? "destructive" : "default"}
              className="flex items-center gap-2"
            >
              {isActive ? (
                <>
                  <Square className="h-4 w-4" />
                  Stop Live View
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start Live View
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Bot Status</div>
              <div className={`text-lg font-semibold flex items-center gap-2 ${getBotStatusColor(botStatus)}`}>
                <Zap className="h-4 w-4" />
                {botStatus.charAt(0).toUpperCase() + botStatus.slice(1)}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Total P&L</div>
              <div className={`text-lg font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(totalPnL)}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Trades Executed</div>
              <div className="text-lg font-bold">{liveTrades.length}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Portfolio Balance</div>
              <div className="text-lg font-bold">{formatCurrency(portfolio?.current_balance || 0)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Market Fluctuations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Live Market Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          {marketData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {isActive ? 'Loading market data...' : 'Start live view to see market fluctuations'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {marketData.map((stock) => (
                <div key={stock.symbol} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{stock.symbol}</span>
                    {getTrendIcon(stock.trend)}
                  </div>
                  <div className="space-y-1">
                    <div className="text-lg font-bold">{formatCurrency(stock.currentPrice)}</div>
                    <div className={`text-sm flex items-center gap-1 ${stock.priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {stock.priceChange >= 0 ? '+' : ''}{formatCurrency(stock.priceChange)}
                      ({stock.priceChangePercent >= 0 ? '+' : ''}{stock.priceChangePercent.toFixed(2)}%)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Trades */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Live Trade Execution
          </CardTitle>
          <CardDescription>
            AI bot decisions and trade executions affecting your portfolio
          </CardDescription>
        </CardHeader>
        <CardContent>
          {liveTrades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {isActive ? 'Waiting for trading opportunities...' : 'Start live view to see AI trades'}
            </div>
          ) : (
            <div className="space-y-4">
              {liveTrades.map((trade, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={trade.action === 'BUY' ? 'default' : 'destructive'}>
                        {trade.action}
                      </Badge>
                      <span className="font-semibold">{trade.symbol}</span>
                      <span className="text-muted-foreground">
                        {trade.quantity} @ {formatCurrency(trade.price)}
                      </span>
                      {trade.simulation && (
                        <Badge variant="outline" className="text-xs">LIVE</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {trade.reason}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm">
                        Confidence: <span className="font-semibold">{trade.confidence}%</span>
                      </div>
                      <Progress value={trade.confidence} className="w-20 h-2" />
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className={`font-semibold ${trade.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {trade.profitLoss >= 0 ? '+' : ''}{formatCurrency(trade.profitLoss)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(trade.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};