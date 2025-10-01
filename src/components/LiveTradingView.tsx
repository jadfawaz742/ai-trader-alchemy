import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { usePortfolioContext } from '@/components/PortfolioProvider';
import { Activity, Bot, TrendingUp, TrendingDown, Zap, Eye, Play, Square } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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
  const { portfolio, updateBalance } = usePortfolioContext();

  // Fetch real market data and trigger bot analysis
  useEffect(() => {
    if (!isActive) return;

    const fetchRealMarketData = async () => {
      const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'META', 'AMZN', 'BTCUSDT', 'ETHUSDT'];
      const newMarketData: MarketFluctuation[] = [];

      for (const symbol of symbols) {
        try {
          let data;
          
          // Check if it's a crypto symbol
          if (symbol.includes('USDT')) {
            const { data: cryptoData, error } = await supabase.functions.invoke('fetch-crypto-prices');
            if (!error && cryptoData?.success && cryptoData?.prices) {
              const crypto = cryptoData.prices.find((p: any) => p.symbol === symbol);
              if (crypto) {
                data = {
                  price: crypto.price,
                  change: crypto.change24h,
                  volume: crypto.volume24h
                };
              }
            }
          } else {
            // Fetch stock data from Yahoo Finance
            const { data: stockData, error } = await supabase.functions.invoke('fetch-stock-price', {
              body: { symbol }
            });
            if (!error && stockData?.success) {
              data = {
                price: stockData.price,
                change: stockData.changePercent,
                volume: stockData.volume
              };
            }
          }

          if (data) {
            const priceChange = data.change;
            let trend: 'bullish' | 'bearish' | 'neutral';
            if (priceChange > 0.5) {
              trend = 'bullish';
            } else if (priceChange < -0.5) {
              trend = 'bearish';
            } else {
              trend = 'neutral';
            }

            newMarketData.push({
              symbol,
              currentPrice: data.price,
              priceChange: (data.price * priceChange) / 100,
              priceChangePercent: priceChange,
              trend,
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error(`Error fetching price for ${symbol}:`, error);
        }
      }

      if (newMarketData.length > 0) {
        setMarketData(newMarketData);
        // Trigger bot analysis with real market data
        await analyzeAndTrade(newMarketData);
      }
    };

    fetchRealMarketData();
    const interval = setInterval(fetchRealMarketData, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [isActive]);

  const analyzeAndTrade = async (currentMarketData: MarketFluctuation[]) => {
    try {
      setBotStatus('analyzing');
      
      // Call the actual trading bot with real market data
      const symbols = currentMarketData.map(m => 
        m.symbol.includes('USDT') ? m.symbol.replace('USDT', '-USD') : m.symbol
      );
      
      const { data, error } = await supabase.functions.invoke('advanced-trading-bot', {
        body: {
          symbols,
          mode: 'live',
          risk: 'moderate',
          portfolioBalance: portfolio?.current_balance || 100000,
          enableShorts: false,
          tradingFrequency: 'medium',
          maxDailyTrades: 20,
          backtestMode: false,
          enhancedPPO: true
        }
      });

      if (error) {
        console.error('Bot analysis error:', error);
        setBotStatus('idle');
        return;
      }

      if (data?.signals && data.signals.length > 0) {
        setBotStatus('trading');
        
        // Process each trading signal
        for (const signal of data.signals) {
          const matchingStock = currentMarketData.find(m => 
            m.symbol === signal.symbol || m.symbol === signal.symbol.replace('-USD', 'USDT')
          );
          
          if (matchingStock) {
            const quantity = Math.floor((portfolio?.current_balance || 100000) * 0.02 / matchingStock.currentPrice);
            const estimatedPnL = signal.action === 'BUY' 
              ? quantity * matchingStock.currentPrice * (signal.confidence / 100) * 0.05
              : quantity * matchingStock.currentPrice * (signal.confidence / 100) * 0.03;

            const newTrade: LiveTrade = {
              symbol: signal.symbol,
              action: signal.action,
              quantity,
              price: matchingStock.currentPrice,
              confidence: signal.confidence,
              reason: signal.reason,
              profitLoss: estimatedPnL,
              simulation: false,
              timestamp: new Date().toISOString()
            };

            setLiveTrades(prev => [newTrade, ...prev.slice(0, 9)]);
            setTotalPnL(prev => prev + estimatedPnL);

            if (portfolio && Math.abs(estimatedPnL) > 10) {
              const newBalance = portfolio.current_balance + estimatedPnL;
              await updateBalance(newBalance);
            }
          }
        }
        
        setTimeout(() => setBotStatus('idle'), 2000);
      } else {
        setBotStatus('idle');
      }
    } catch (error) {
      console.error('Error in bot analysis:', error);
      setBotStatus('idle');
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