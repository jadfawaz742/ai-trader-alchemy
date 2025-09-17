import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Bot, Play, Square, TrendingUp, TrendingDown, DollarSign, Clock, Target, Zap, Activity, Settings, BarChart3 } from 'lucide-react';
import { StockChart } from '@/components/StockChart';
import { StockSelector } from '@/components/StockSelector';
import { Link } from 'react-router-dom';

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
  momentum?: string;
  volumeSpike?: boolean;
  simulation?: boolean;
  currentPrice?: number;
  closeReason?: 'stop_loss' | 'take_profit' | 'manual' | 'duration';
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

interface UnifiedAITradingProps {
  portfolio: any;
  tradingAmount: string;
  setTradingAmount: (value: string) => void;
  riskLevel: number[];
  setRiskLevel: (value: number[]) => void;
  stopLoss: number[];
  setStopLoss: (value: number[]) => void;
  takeProfit: number[];
  setTakeProfit: (value: number[]) => void;
  tradeDuration: number[];
  setTradeDuration: (value: number[]) => void;
  simulationMode: boolean;
  setSimulationMode: (value: boolean) => void;
  session: TradingSession;
  setSession: (value: TradingSession | ((prev: TradingSession) => TradingSession)) => void;
  intervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
  tradeUpdateRef: React.MutableRefObject<NodeJS.Timeout | null>;
  loadPortfolio?: () => void;
}

export const UnifiedAITrading: React.FC<UnifiedAITradingProps> = ({
  portfolio,
  tradingAmount,
  setTradingAmount,
  riskLevel,
  setRiskLevel,
  stopLoss,
  setStopLoss,
  takeProfit,
  setTakeProfit,
  tradeDuration,
  setTradeDuration,
  simulationMode,
  setSimulationMode,
  session,
  setSession,
  intervalRef,
  tradeUpdateRef,
  loadPortfolio
}) => {
  const [activeTab, setActiveTab] = useState('config');
  const [selectedStocks, setSelectedStocks] = useState<string[]>(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']);
  const { toast } = useToast();

  // Auto-switch to live view when trading starts
  useEffect(() => {
    if (session.isActive && activeTab === 'config') {
      setActiveTab('live');
    }
  }, [session.isActive, activeTab]);

  // Update active trades with simulated P&L
  useEffect(() => {
    if (!session.isActive || session.activeTrades.length === 0) return;
    
    const interval = setInterval(() => {
      setSession(prevSession => {
        if (!prevSession.isActive) return prevSession;

        // Check portfolio-level stop loss/take profit
        const portfolioPnLPercent = ((prevSession.currentBalance - prevSession.startingBalance) / prevSession.startingBalance) * 100;
        
        if (portfolioPnLPercent <= -Math.abs(stopLoss[0])) {
          console.log(`🚨 PORTFOLIO STOP LOSS TRIGGERED! P&L: ${portfolioPnLPercent.toFixed(2)}%`);
          toast({
            title: "🚨 Portfolio Stop Loss Triggered!",
            description: `Portfolio lost ${Math.abs(portfolioPnLPercent).toFixed(2)}% (Limit: ${Math.abs(stopLoss[0])}%)`,
            variant: "destructive"
          });
          
          clearIntervals();
          return { ...prevSession, isActive: false, activeTrades: [] };
        }
        
        if (portfolioPnLPercent >= takeProfit[0]) {
          console.log(`🎯 PORTFOLIO TAKE PROFIT TRIGGERED! P&L: ${portfolioPnLPercent.toFixed(2)}%`);
          toast({
            title: "🎯 Portfolio Take Profit Triggered!",
            description: `Portfolio gained ${portfolioPnLPercent.toFixed(2)}% (Target: ${takeProfit[0]}%)`,
            variant: "default"
          });
          
          clearIntervals();
          return { ...prevSession, isActive: false, activeTrades: [] };
        }

        // Update trade prices and P&L
        const updatedTrades = prevSession.activeTrades.map(trade => {
          const volatility = 0.03; // 3% volatility
          const priceChange = (Math.random() - 0.5) * 2 * volatility;
          const newPrice = trade.currentPrice ? trade.currentPrice * (1 + priceChange) : trade.price * (1 + priceChange);
          
          const pnl = trade.action === 'BUY' 
            ? (newPrice - trade.price) * trade.quantity
            : (trade.price - newPrice) * trade.quantity;
          
          return { ...trade, currentPrice: newPrice, profitLoss: pnl };
        });

        const totalPnL = updatedTrades.reduce((sum, trade) => sum + trade.profitLoss, 0);
        const newBalance = prevSession.startingBalance + totalPnL;
        
        return {
          ...prevSession,
          activeTrades: updatedTrades,
          currentBalance: newBalance,
          totalPnL
        };
      });
    }, 2000); // Update every 2 seconds

    tradeUpdateRef.current = interval;
    return () => clearInterval(interval);
  }, [session.isActive, session.activeTrades.length, stopLoss, takeProfit, toast]);

  const clearIntervals = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (tradeUpdateRef.current) {
      clearInterval(tradeUpdateRef.current);
      tradeUpdateRef.current = null;
    }
  };

  const saveTrade = async (trade: LiveTrade) => {
    if (!portfolio) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Save trade to database
      await supabase.from('trades').insert({
        user_id: user.id,
        portfolio_id: portfolio.id,
        symbol: trade.symbol,
        trade_type: trade.action,
        quantity: trade.quantity,
        price: trade.price,
        total_amount: trade.price * trade.quantity,
        risk_score: Math.round(100 - trade.confidence),
        ppo_signal: { 
          confidence: trade.confidence,
          momentum: trade.momentum,
          simulation: simulationMode
        }
      });

      console.log(`Trade saved: ${trade.action} ${trade.quantity} ${trade.symbol} @ $${trade.price}`);
    } catch (error) {
      console.error('Error saving trade:', error);
    }
  };

  const startTrading = async () => {
    if (!portfolio) {
      toast({
        title: "Error",
        description: "No portfolio found",
        variant: "destructive"
      });
      return;
    }

    if (!tradingAmount || parseFloat(tradingAmount) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid trading amount",
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
      title: `${simulationMode ? 'Simulation' : 'Live'} Trading Started`,
      description: `AI trading started with $${tradingAmount} at ${riskLevel[0]}% risk level`
    });

    // Start executing trades
    await executeTrade();
    
    // Set interval for future trades
    const tradingInterval = Math.max(15000, 45000 - (riskLevel[0] * 300)); // 15-45 seconds based on risk
    intervalRef.current = setInterval(executeTrade, tradingInterval);
  };

  const executeTrade = async () => {
    try {
      console.log('🤖 Executing AI trade analysis...');
      
      const { data, error } = await supabase.functions.invoke('auto-trade', {
        body: {
          portfolioId: portfolio.id,
          simulationMode,
          riskLevel: riskLevel[0],
          maxAmount: parseFloat(tradingAmount),
          selectedStocks
        }
      });

      if (error) {
        console.error('❌ Auto-trade function error:', error);
        throw error;
      }

      if (data?.success && data.trades && data.trades.length > 0) {
        const newTrades = data.trades.map((trade: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          symbol: trade.symbol,
          action: trade.action.toUpperCase(),
          quantity: trade.quantity,
          price: trade.price,
          timestamp: new Date().toISOString(),
          confidence: trade.confidence || 75,
          profitLoss: 0,
          status: 'executed' as const,
          duration: tradeDuration[0],
          momentum: trade.momentum || 'neutral',
          volumeSpike: trade.volumeSpike || false,
          simulation: simulationMode,
          currentPrice: trade.price
        }));

        // Save trades to database
        for (const trade of newTrades) {
          await saveTrade(trade);
        }

        // Update session with new trades
        setSession(prev => ({
          ...prev,
          activeTrades: [...prev.activeTrades, ...newTrades],
          totalTrades: prev.totalTrades + newTrades.length
        }));

        // Schedule trade closures
        newTrades.forEach((trade: LiveTrade) => {
          setTimeout(() => closeTrade(trade.id), trade.duration * 1000);
        });

        toast({
          title: "🤖 AI Trades Executed",
          description: `Generated ${newTrades.length} trades based on market analysis`
        });
      } else {
        console.log('⏳ No trading opportunities found...');
      }
    } catch (error) {
      console.error('❌ Error executing trade:', error);
      toast({
        title: "❌ Trading Error",
        description: error.message || "Failed to execute trade",
        variant: "destructive"
      });
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
    clearIntervals();

    setSession(prev => ({
      ...prev,
      isActive: false,
      completedTrades: [...prev.completedTrades, ...prev.activeTrades.map(t => ({ ...t, status: 'closed' as const }))],
      activeTrades: []
    }));

    toast({
      title: "Trading Stopped",
      description: `Final P&L: ${session.totalPnL >= 0 ? '+' : ''}$${session.totalPnL.toFixed(2)}`
    });
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Trading Assistant
            {session.isActive && (
              <Badge variant="default" className="ml-2 animate-pulse">
                <div className="w-2 h-2 bg-white rounded-full mr-1 animate-ping"></div>
                LIVE
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Configure and manage AI-powered trading with advanced risk management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="config" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configuration
              </TabsTrigger>
              <TabsTrigger value="live" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Live Trading
                {session.isActive && (
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse ml-1"></div>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="space-y-6">
              <div className="grid gap-6">
                {/* Stock Selection */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Stock Selection</Label>
                  <StockSelector
                    selectedStocks={selectedStocks}
                    onSelectionChange={setSelectedStocks}
                    maxSelection={8}
                  />
                  <p className="text-sm text-muted-foreground">
                    AI will analyze and trade selected stocks based on market conditions and news
                  </p>
                </div>

                {/* Trading Amount */}
                <div className="space-y-3">
                  <Label htmlFor="trading-amount" className="text-base font-semibold">Trading Amount</Label>
                  <Input
                    id="trading-amount"
                    type="number"
                    placeholder="Enter amount (e.g., 1000)"
                    value={tradingAmount}
                    onChange={(e) => setTradingAmount(e.target.value)}
                    className="w-full"
                  />
                  <p className="text-sm text-muted-foreground">
                    Maximum amount available for AI trading operations
                  </p>
                </div>

                {/* Risk Level */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Risk Level: {riskLevel[0]}%</Label>
                  <Slider
                    value={riskLevel}
                    onValueChange={setRiskLevel}
                    max={100}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Conservative</span>
                    <span>Aggressive</span>
                  </div>
                </div>

                {/* Stop Loss */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Stop Loss: {stopLoss[0]}%</Label>
                  <Slider
                    value={stopLoss}
                    onValueChange={setStopLoss}
                    max={50}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Take Profit */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Take Profit: {takeProfit[0]}%</Label>
                  <Slider
                    value={takeProfit}
                    onValueChange={setTakeProfit}
                    max={100}
                    min={5}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Trade Duration */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Trade Duration: {formatDuration(tradeDuration[0])}</Label>
                  <Slider
                    value={tradeDuration}
                    onValueChange={setTradeDuration}
                    max={300}
                    min={30}
                    step={30}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>30s</span>
                    <span>5min</span>
                  </div>
                </div>

                {/* Simulation Mode */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">Simulation Mode</div>
                    <div className="text-sm text-muted-foreground">
                      {simulationMode ? 'Trade with virtual money for testing' : 'Use real portfolio balance'}
                    </div>
                  </div>
                  <Switch
                    checked={simulationMode}
                    onCheckedChange={setSimulationMode}
                    disabled={session.isActive}
                  />
                </div>

                {/* Portfolio Info */}
                {portfolio && (
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Portfolio Balance</div>
                        <div className="font-semibold">{formatCurrency(portfolio.current_balance)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Total P&L</div>
                        <div className={`font-semibold ${portfolio.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(portfolio.total_pnl)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Start/Stop Button */}
                <Button
                  onClick={session.isActive ? stopTrading : startTrading}
                  className={`w-full ${session.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                  disabled={!portfolio || (!session.isActive && (!tradingAmount || parseFloat(tradingAmount) <= 0))}
                >
                  {session.isActive ? (
                    <>
                      <Square className="w-4 h-4 mr-2" />
                      Stop AI Trading
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Start AI Trading
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="live" className="space-y-6">
              {/* Session Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Starting Balance</p>
                        <p className="text-lg font-semibold">{formatCurrency(session.startingBalance)}</p>
                      </div>
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Current Balance</p>
                        <p className="text-lg font-semibold">{formatCurrency(session.currentBalance)}</p>
                      </div>
                      <Target className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">P&L</p>
                        <p className={`text-lg font-semibold ${session.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {session.totalPnL >= 0 ? '+' : ''}{formatCurrency(session.totalPnL)}
                        </p>
                      </div>
                      {session.totalPnL >= 0 ? 
                        <TrendingUp className="h-4 w-4 text-green-600" /> : 
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      }
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Trades</p>
                        <p className="text-lg font-semibold">{session.totalTrades}</p>
                      </div>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Active Trades */}
              {session.activeTrades.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Active Trades ({session.activeTrades.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {session.activeTrades.map((trade) => (
                        <div key={trade.id} className="flex items-center justify-between p-3 border rounded">
                          <div className="flex items-center gap-3">
                            <Badge variant={trade.action === 'BUY' ? 'default' : 'secondary'}>
                              {trade.action}
                            </Badge>
                            <div>
                              <div className="font-semibold">{trade.symbol}</div>
                              <div className="text-sm text-muted-foreground">
                                {trade.quantity} @ ${trade.price.toFixed(2)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-semibold ${trade.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {trade.profitLoss >= 0 ? '+' : ''}{formatCurrency(trade.profitLoss)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {trade.confidence}% confidence
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Trading Status */}
              <Card>
                <CardContent className="p-6">
                  <div className="text-center">
                    {session.isActive ? (
                      <>
                        <div className="flex items-center justify-center gap-2 mb-4">
                          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-lg font-semibold">AI Trading Active</span>
                        </div>
                        <p className="text-muted-foreground mb-4">
                          AI is analyzing market conditions and executing trades based on your risk settings
                        </p>
                        <Button onClick={stopTrading} variant="destructive">
                          <Square className="w-4 h-4 mr-2" />
                          Stop Trading
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="mb-4">
                          <span className="text-lg font-semibold">AI Trading Inactive</span>
                        </div>
                        <p className="text-muted-foreground mb-4">
                          Configure your settings and start AI trading to begin automated market analysis
                        </p>
                        <Button onClick={() => setActiveTab('config')}>
                          <Settings className="w-4 h-4 mr-2" />
                          Configure Settings
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Live Charts for Active Trades */}
              {session.activeTrades.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {session.activeTrades.slice(0, 4).map((trade) => (
                    <Card key={trade.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between">
                          <span>{trade.symbol}</span>
                          <Badge variant={trade.action === 'BUY' ? 'default' : 'secondary'} className="text-xs">
                            {trade.action}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <StockChart symbol={trade.symbol} />
                        <div className="mt-2 text-sm">
                          <div className="flex justify-between">
                            <span>Entry: ${trade.price.toFixed(2)}</span>
                            <span>Current: ${(trade.currentPrice || trade.price).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Quantity: {trade.quantity}</span>
                            <span className={trade.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}>
                              P&L: {formatCurrency(trade.profitLoss)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};