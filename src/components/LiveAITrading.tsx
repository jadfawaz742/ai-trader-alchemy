import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Bot, Play, Square, TrendingUp, TrendingDown, DollarSign, Clock, Target, Zap, Activity } from 'lucide-react';

interface LiveTrade {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  timestamp: string;
  confidence: number;
  profitLoss: number;
  status: 'pending' | 'executed' | 'closed';
  duration: number;
}

interface TradingSession {
  isActive: boolean;
  startTime: string;
  totalTrades: number;
  totalPnL: number;
  activeTrades: LiveTrade[];
  completedTrades: LiveTrade[];
  currentBalance: number;
  startingBalance: number;
}

export const LiveAITrading: React.FC = () => {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [tradingAmount, setTradingAmount] = useState('1000');
  const [riskLevel, setRiskLevel] = useState([75]); // Default to higher risk for more action
  const [tradeDuration, setTradeDuration] = useState([300]); // 5 minutes default
  const [simulationMode, setSimulationMode] = useState(true);
  const [session, setSession] = useState<TradingSession>({
    isActive: false,
    startTime: '',
    totalTrades: 0,
    totalPnL: 0,
    activeTrades: [],
    completedTrades: [],
    currentBalance: 0,
    startingBalance: 0
  });
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const tradeUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPortfolio();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (tradeUpdateRef.current) clearInterval(tradeUpdateRef.current);
    };
  }, []);

  // Update active trades with live P&L
  useEffect(() => {
    if (session.isActive && session.activeTrades.length > 0) {
      tradeUpdateRef.current = setInterval(() => {
        setSession(prev => {
          const updatedActiveTrades = prev.activeTrades.map(trade => {
            // Simulate live price changes
            const priceChange = (Math.random() - 0.5) * 0.05 * trade.price; // ±5% volatility
            const newPrice = Math.max(trade.price + priceChange, trade.price * 0.9); // Don't go below 10% loss
            
            const newPnL = trade.action === 'BUY' 
              ? (newPrice - trade.price) * trade.quantity
              : (trade.price - newPrice) * trade.quantity;
            
            return {
              ...trade,
              profitLoss: Number(newPnL.toFixed(2))
            };
          });
          
          const totalActivePnL = updatedActiveTrades.reduce((sum, trade) => sum + trade.profitLoss, 0);
          const completedPnL = prev.completedTrades.reduce((sum, trade) => sum + trade.profitLoss, 0);
          
          return {
            ...prev,
            activeTrades: updatedActiveTrades,
            totalPnL: Number((totalActivePnL + completedPnL).toFixed(2)),
            currentBalance: prev.startingBalance + totalActivePnL + completedPnL
          };
        });
      }, 2000); // Update every 2 seconds
    } else if (tradeUpdateRef.current) {
      clearInterval(tradeUpdateRef.current);
      tradeUpdateRef.current = null;
    }

    return () => {
      if (tradeUpdateRef.current) {
        clearInterval(tradeUpdateRef.current);
        tradeUpdateRef.current = null;
      }
    };
  }, [session.isActive, session.activeTrades.length]);

  const loadPortfolio = async () => {
    try {
      const { data } = await supabase
        .from('portfolios')
        .select('*')
        .limit(1)
        .single();
      
      if (data) {
        setPortfolio(data);
      }
    } catch (error) {
      console.error('Error loading portfolio:', error);
    }
  };

  const startLiveTrading = async () => {
    if (!portfolio) {
      toast({
        title: "Error",
        description: "No portfolio found",
        variant: "destructive"
      });
      return;
    }

    const startingBalance = parseFloat(tradingAmount);
    setSession({
      isActive: true,
      startTime: new Date().toISOString(),
      totalTrades: 0,
      totalPnL: 0,
      activeTrades: [],
      completedTrades: [],
      currentBalance: startingBalance,
      startingBalance
    });

    toast({
      title: "AI Trading Started",
      description: `Live trading session started with $${tradingAmount} at ${riskLevel[0]}% risk level`
    });

    // Start executing trades at intervals
    intervalRef.current = setInterval(async () => {
      await executeSingleTrade();
    }, 10000); // Execute a trade every 10 seconds

    // Execute first trade immediately
    setTimeout(executeSingleTrade, 2000);
  };

  const executeSingleTrade = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('auto-trade', {
        body: {
          portfolioId: portfolio.id,
          simulationMode: true, // Always simulate for live view
          riskLevel: riskLevel[0],
          maxAmount: parseFloat(tradingAmount),
          tradeDuration: tradeDuration[0]
        }
      });

      if (error) throw error;

      if (data.success && data.trades && data.trades.length > 0) {
        const newTrades = data.trades.map((trade: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          symbol: trade.symbol,
          action: trade.action,
          quantity: trade.quantity,
          price: trade.price,
          timestamp: new Date().toISOString(),
          confidence: trade.confidence,
          profitLoss: 0, // Start at 0, will update live
          status: 'executed' as const,
          duration: tradeDuration[0]
        }));

        setSession(prev => ({
          ...prev,
          activeTrades: [...prev.activeTrades, ...newTrades],
          totalTrades: prev.totalTrades + newTrades.length
        }));

        // Schedule trade closures
        newTrades.forEach((trade: LiveTrade) => {
          setTimeout(() => {
            closeTrade(trade.id);
          }, trade.duration * 1000);
        });
      }
    } catch (error) {
      console.error('Error executing trade:', error);
    }
  };

  const closeTrade = (tradeId: string) => {
    setSession(prev => {
      const tradeToClose = prev.activeTrades.find(t => t.id === tradeId);
      if (!tradeToClose) return prev;

      const closedTrade = { ...tradeToClose, status: 'closed' as const };
      
      return {
        ...prev,
        activeTrades: prev.activeTrades.filter(t => t.id !== tradeId),
        completedTrades: [...prev.completedTrades, closedTrade]
      };
    });
  };

  const stopTrading = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (tradeUpdateRef.current) {
      clearInterval(tradeUpdateRef.current);
      tradeUpdateRef.current = null;
    }

    // Close all active trades
    setSession(prev => ({
      ...prev,
      isActive: false,
      completedTrades: [...prev.completedTrades, ...prev.activeTrades.map(t => ({ ...t, status: 'closed' as const }))],
      activeTrades: []
    }));

    toast({
      title: "Trading Stopped",
      description: "AI trading session has been stopped"
    });
  };

  const getRiskColor = (level: number) => {
    if (level <= 33) return 'text-green-600';
    if (level <= 66) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Trading Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Live AI Trading Dashboard
          </CardTitle>
          <CardDescription>
            Watch AI make trades in real-time with custom risk levels and duration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Controls */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Trading Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={tradingAmount}
                  onChange={(e) => setTradingAmount(e.target.value)}
                  disabled={session.isActive}
                  min="100"
                  max="10000"
                />
              </div>

              <div className="space-y-3">
                <Label>Risk Level: <span className={`font-bold ${getRiskColor(riskLevel[0])}`}>
                  {riskLevel[0]}%
                </span></Label>
                <Slider
                  value={riskLevel}
                  onValueChange={setRiskLevel}
                  max={100}
                  min={1}
                  step={1}
                  disabled={session.isActive}
                  className="w-full"
                />
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>Conservative</div>
                  <div className="text-center">Moderate</div>
                  <div className="text-right">Aggressive</div>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Trade Duration: <span className="font-bold">
                  {formatDuration(tradeDuration[0])}
                </span></Label>
                <Slider
                  value={tradeDuration}
                  onValueChange={setTradeDuration}
                  max={1800} // 30 minutes max
                  min={30}   // 30 seconds min
                  step={30}
                  disabled={session.isActive}
                  className="w-full"
                />
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>30s</div>
                  <div className="text-center">15m</div>
                  <div className="text-right">30m</div>
                </div>
              </div>
            </div>

            {/* Session Stats */}
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Starting Balance</div>
                    <div className="text-lg font-bold">{formatCurrency(session.startingBalance)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Current Balance</div>
                    <div className={`text-lg font-bold ${session.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(session.currentBalance)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Total P&L</div>
                    <div className={`text-lg font-bold ${session.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {session.totalPnL >= 0 ? '+' : ''}{formatCurrency(session.totalPnL)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Total Trades</div>
                    <div className="text-lg font-bold">{session.totalTrades}</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {!session.isActive ? (
                  <Button
                    onClick={startLiveTrading}
                    className="flex-1 h-12"
                    disabled={!tradingAmount}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Start Live Trading
                  </Button>
                ) : (
                  <Button
                    onClick={stopTrading}
                    variant="destructive"
                    className="flex-1 h-12"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop Trading
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Trades */}
      {session.isActive && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Live Active Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            {session.activeTrades.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>AI is analyzing markets...</span>
                </div>
                <div className="text-sm">Waiting for trading opportunities</div>
              </div>
            ) : (
              <div className="space-y-3">
                {session.activeTrades.map((trade) => (
                  <div key={trade.id} className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={trade.action === 'BUY' ? 'default' : 'destructive'}>
                          {trade.action}
                        </Badge>
                        <span className="font-semibold text-lg">{trade.symbol}</span>
                        <span className="text-muted-foreground">
                          {trade.quantity} @ {formatCurrency(trade.price)}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${trade.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {trade.profitLoss >= 0 ? '+' : ''}{formatCurrency(trade.profitLoss)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          Confidence: {trade.confidence}%
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Duration: {formatDuration(trade.duration)}
                        </div>
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(trade.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="mt-2">
                      <Progress value={trade.confidence} className="h-1" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Completed Trades */}
      {session.completedTrades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Completed Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {session.completedTrades.slice(-10).reverse().map((trade) => (
                <div key={trade.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-2">
                    <Badge variant={trade.action === 'BUY' ? 'default' : 'destructive'} className="text-xs">
                      {trade.action}
                    </Badge>
                    <span className="font-medium">{trade.symbol}</span>
                    <span className="text-sm text-muted-foreground">{trade.quantity} shares</span>
                  </div>
                  <div className={`font-bold ${trade.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {trade.profitLoss >= 0 ? '+' : ''}{formatCurrency(trade.profitLoss)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};