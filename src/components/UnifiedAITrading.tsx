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

  // Update active trades with live P&L and auto-stop based on parameters
  useEffect(() => {
    if (!session.isActive) return;
    
    const interval = setInterval(() => {
      setSession(prevSession => {
        if (!prevSession.isActive) {
          return prevSession;
        }

        // Check portfolio-level stop loss/take profit first
        const portfolioPnLPercent = ((prevSession.currentBalance - prevSession.startingBalance) / prevSession.startingBalance) * 100;
        
        // Portfolio-level stop loss check
        if (portfolioPnLPercent <= -Math.abs(stopLoss[0])) {
          console.log(`🚨 PORTFOLIO STOP LOSS TRIGGERED! P&L: ${portfolioPnLPercent.toFixed(2)}%`);
          toast({
            title: "🚨 Portfolio Stop Loss Triggered!",
            description: `Portfolio lost ${Math.abs(portfolioPnLPercent).toFixed(2)}% (Limit: ${Math.abs(stopLoss[0])}%)`,
            variant: "destructive"
          });
          
          // Stop trading immediately
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          if (tradeUpdateRef.current) {
            clearInterval(tradeUpdateRef.current);
            tradeUpdateRef.current = null;
          }
          
          return {
            ...prevSession,
            isActive: false,
            activeTrades: [] // Close all trades
          };
        }
        
        // Portfolio-level take profit check
        if (portfolioPnLPercent >= takeProfit[0]) {
          console.log(`🎯 PORTFOLIO TAKE PROFIT TRIGGERED! P&L: ${portfolioPnLPercent.toFixed(2)}%`);
          toast({
            title: "🎯 Portfolio Take Profit Triggered!",
            description: `Portfolio gained ${portfolioPnLPercent.toFixed(2)}% (Target: ${takeProfit[0]}%)`,
            variant: "default"
          });
          
          // Stop trading immediately
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          if (tradeUpdateRef.current) {
            clearInterval(tradeUpdateRef.current);
            tradeUpdateRef.current = null;
          }
          
          return {
            ...prevSession,
            isActive: false,
            activeTrades: [] // Close all trades
          };
        }

        if (prevSession.activeTrades.length === 0) {
          return prevSession;
        }

        const updatedTrades = prevSession.activeTrades.map(trade => {
          // Simulate more aggressive price movements
          const volatility = 0.05; // 5% volatility
          const priceChange = (Math.random() - 0.5) * 2 * volatility;
          const newPrice = trade.currentPrice ? trade.currentPrice * (1 + priceChange) : trade.price * (1 + priceChange);
          
          const pnl = trade.action === 'BUY' 
            ? (newPrice - trade.price) * trade.quantity
            : (trade.price - newPrice) * trade.quantity;
          
          return {
            ...trade,
            currentPrice: newPrice,
            profitLoss: pnl
          };
        });

        const newBalance = prevSession.startingBalance + updatedTrades.reduce((sum, trade) => sum + trade.profitLoss, 0);
        
        return {
          ...prevSession,
          activeTrades: updatedTrades,
          currentBalance: newBalance,
          totalPnL: newBalance - prevSession.startingBalance
        };
      });
    }, 1000);

    tradeUpdateRef.current = interval;
    return () => clearInterval(interval);
  }, [session.isActive, stopLoss, takeProfit, toast]);

  const saveTrade = async (trade: LiveTrade) => {
    if (!portfolio) return;
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Save to trades table
      const { error: tradeError } = await supabase
        .from('trades')
        .insert({
          user_id: user.id,
          portfolio_id: portfolio.id,
          symbol: trade.symbol,
          trade_type: trade.action,
          quantity: trade.quantity,
          price: trade.currentPrice || trade.price,
          total_amount: Math.abs((trade.currentPrice || trade.price) * trade.quantity),
          risk_score: Math.round(100 - trade.confidence), // Convert confidence to risk score
          ppo_signal: { 
            confidence: trade.confidence,
            momentum: trade.momentum,
            closeReason: trade.closeReason
          }
        });

      console.log('Trade saved successfully:', trade.symbol, trade.action);

      // Update or create position
      const { data: existingPosition } = await supabase
        .from('positions')
        .select('*')
        .eq('portfolio_id', portfolio.id)
        .eq('symbol', trade.symbol)
        .single();

      if (existingPosition) {
        // Update existing position
        let newQuantity = trade.action === 'BUY' 
          ? existingPosition.quantity + trade.quantity
          : existingPosition.quantity - trade.quantity;

        if (newQuantity <= 0) {
          // Close position if quantity reaches zero or below
          await supabase
            .from('positions')
            .delete()
            .eq('id', existingPosition.id);
        } else {
          // Update position with new average price
          const totalCost = existingPosition.total_cost + (trade.action === 'BUY' ? 1 : -1) * (trade.currentPrice || trade.price) * trade.quantity;
          const avgPrice = totalCost / newQuantity;
          const currentValue = newQuantity * (trade.currentPrice || trade.price);
          const unrealizedPnL = currentValue - totalCost;

          await supabase
            .from('positions')
            .update({
              quantity: newQuantity,
              average_price: avgPrice,
              current_price: trade.currentPrice || trade.price,
              total_cost: totalCost,
              current_value: currentValue,
              unrealized_pnl: unrealizedPnL
            })
            .eq('id', existingPosition.id);
        }
      } else if (trade.action === 'BUY') {
        // Create new position for BUY orders only
        const totalCost = (trade.currentPrice || trade.price) * trade.quantity;
        await supabase
          .from('positions')
          .insert({
            user_id: user.id,
            portfolio_id: portfolio.id,
            symbol: trade.symbol,
            quantity: trade.quantity,
            average_price: trade.currentPrice || trade.price,
            current_price: trade.currentPrice || trade.price,
            total_cost: totalCost,
            current_value: totalCost,
            unrealized_pnl: 0
          });
      }

      // Update portfolio balance if not simulation
      if (!simulationMode) {
        const realizedPnL = trade.profitLoss || 0;
        const balanceChange = trade.action === 'BUY' 
          ? -(trade.price * trade.quantity) + realizedPnL
          : (trade.currentPrice || trade.price) * trade.quantity + realizedPnL;

        const newBalance = portfolio.current_balance + balanceChange;
        const newPnL = newBalance - portfolio.initial_balance;

        const { error: portfolioError } = await supabase
          .from('portfolios')
          .update({ 
            current_balance: newBalance,
            total_pnl: newPnL,
            updated_at: new Date().toISOString()
          })
          .eq('id', portfolio.id);

        if (portfolioError) throw portfolioError;
        
        // Update session balance immediately for UI responsiveness
        setSession(prev => ({
          ...prev,
          currentBalance: newBalance
        }));
      }
      
      // Reload portfolio data efficiently
      if (loadPortfolio) {
        loadPortfolio();
      }
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
      title: `${!simulationMode ? 'Live' : 'Simulation'} Trading Started`,
      description: `AI trading started with $${tradingAmount} at ${riskLevel[0]}% risk level`
    });

    // Start executing trades immediately, then at intervals
    await executeSingleTrade();
    
    const tradingInterval = Math.max(10000, 30000 - (riskLevel[0] * 200));
    intervalRef.current = setInterval(async () => {
      await executeSingleTrade();
    }, tradingInterval);
  };

  const executeSingleTrade = async () => {
    try {
      console.log('🤖 Executing AI trade analysis...');
      
      const { data, error } = await supabase.functions.invoke('auto-trade', {
        body: {
          portfolioId: portfolio.id,
          simulationMode,
          riskLevel: riskLevel[0],
          maxAmount: parseFloat(tradingAmount),
          stopLossPercent: stopLoss[0],
          takeProfitPercent: takeProfit[0],
          tradeDuration: tradeDuration[0]
        }
      });

      if (error) {
        console.error('❌ Auto-trade function error:', error);
        throw error;
      }

      console.log('✅ Auto-trade response:', data);

      if (data?.takeProfitTriggered) {
        console.log('🎯 Take profit triggered, stopping trading');
        stopTrading();
        return;
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

        console.log(`📈 Generated ${newTrades.length} new trades:`, newTrades.map(t => `${t.action} ${t.symbol}`));

        // Save each trade immediately when executed
        for (const trade of newTrades) {
          // Save simulation trade
          await saveTrade(trade);
        }

        setSession(prev => ({
          ...prev,
          activeTrades: [...prev.activeTrades, ...newTrades],
          totalTrades: prev.totalTrades + newTrades.length
        }));

        // Schedule trade closures based on duration
        newTrades.forEach((trade: LiveTrade) => {
          setTimeout(() => {
            closeTrade(trade.id);
          }, trade.duration * 1000);
        });

        toast({
          title: "🤖 AI Trades Executed",
          description: `Generated ${newTrades.length} trades based on market analysis`
        });
      } else {
        console.log('⏳ No trading opportunities found, waiting for next analysis...');
      }
    } catch (error) {
      console.error('❌ Error executing trade:', error);
      
      // Show user-friendly error message
      toast({
        title: "❌ Trading Error",
        description: error.message || "Failed to execute trade. Check console for details.",
        variant: "destructive"
      });
      
      // Generate mock trade for demo purposes if in simulation mode
      if (simulationMode) {
        console.log('🎭 Generating mock trade for demo...');
        generateMockTrade();
      }
    }
  };

  const generateMockTrade = async () => {
    const symbols = [
      // Large Cap
      'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA',
      // Medium Cap
      'SPOT', 'SQ', 'ROKU', 'TWLO', 'SNOW', 'NET', 'DDOG',
      // Small Cap & Emerging
      'PLTR', 'RBLX', 'COIN', 'HOOD', 'SOFI', 'RIVN', 'LCID',
      // Traditional
      'JPM', 'V', 'MA', 'DIS', 'KO', 'WMT', 'JNJ',
      // Energy
      'XOM', 'NEE', 'ENPH', 'FSLR',
      // Biotech
      'MRNA', 'BNTX', 'GILD', 'REGN',
      // International
      'BABA', 'NIO', 'TSM', 'ASML'
    ];
    const actions: ("BUY" | "SELL")[] = ['BUY', 'SELL'];
    const mockTrade: LiveTrade = {
      id: Math.random().toString(36).substr(2, 9),
      symbol: symbols[Math.floor(Math.random() * symbols.length)],
      action: actions[Math.floor(Math.random() * actions.length)],
      quantity: Math.floor(Math.random() * 10) + 1,
      price: Math.random() * 200 + 50,
      timestamp: new Date().toISOString(),
      confidence: Math.floor(Math.random() * 40) + 60,
      profitLoss: 0,
      status: 'executed',
      duration: tradeDuration[0],
      momentum: 'neutral',
      volumeSpike: false,
      simulation: true
    };

    // Save the mock trade immediately
    await saveTrade(mockTrade);

    setSession(prev => ({
      ...prev,
      activeTrades: [...prev.activeTrades, mockTrade],
      totalTrades: prev.totalTrades + 1
    }));

    setTimeout(() => {
      closeTrade(mockTrade.id);
    }, mockTrade.duration * 1000);
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

  const getRiskLevelColor = (level: number) => {
    if (level <= 30) return 'text-green-600';
    if (level <= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRiskLevelText = (level: number) => {
    if (level <= 30) return 'Conservative';
    if (level <= 70) return 'Moderate';
    return 'Aggressive';
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

            <TabsContent value="config" className="space-y-6 mt-6">
              {/* Stock Selection */}
              <StockSelector
                selectedStocks={selectedStocks}
                onSelectionChange={setSelectedStocks}
                maxSelection={8}
                title="Select Stocks for AI Trading"
                description="Choose which stocks the AI should analyze and trade"
              />
              
              {/* Trading Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Trading Amount ($)</Label>
                    <Input
                      id="amount"
                      type="number"
                      value={tradingAmount}
                      onChange={(e) => setTradingAmount(e.target.value)}
                      disabled={session.isActive}
                      placeholder="Enter amount to trade"
                      min="1"
                      max="10000"
                    />
                    <p className="text-sm text-muted-foreground">
                      Maximum amount the AI can use per trading session
                    </p>
                  </div>

                  <div className="space-y-4">
                    <Label>Risk Level: <span className={`font-semibold ${getRiskLevelColor(riskLevel[0])}`}>
                      {getRiskLevelText(riskLevel[0])} ({riskLevel[0]}%)
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
                      <div className="text-left">Conservative (1-30%)</div>
                      <div className="text-center">Moderate (31-70%)</div>
                      <div className="text-right">Aggressive (71-100%)</div>
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

                <div className="space-y-4">
                  {/* Stop Loss and Take Profit */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <Label>Stop Loss: <span className="font-semibold text-red-600">-{stopLoss[0]}%</span></Label>
                      <Slider
                        value={stopLoss}
                        onValueChange={setStopLoss}
                        max={20}
                        min={1}
                        step={1}
                        disabled={session.isActive}
                        className="w-full"
                      />
                      <div className="text-xs text-muted-foreground">
                        Automatically cut losses at -{stopLoss[0]}%
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label>Take Profit: <span className="font-semibold text-green-600">+{takeProfit[0]}%</span></Label>
                      <Slider
                        value={takeProfit}
                        onValueChange={setTakeProfit}
                        max={50}
                        min={5}
                        step={1}
                        disabled={session.isActive}
                        className="w-full"
                      />
                      <div className="text-xs text-muted-foreground">
                        Automatically take profits at +{takeProfit[0]}%
                      </div>
                    </div>
                  </div>

                  {/* Simulation Mode */}
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <div className="font-medium">Simulation Mode</div>
                      <div className="text-sm text-muted-foreground">
                        {simulationMode ? 'Test AI strategies without real money' : 'Trade with real money'}
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
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Available Balance</span>
                        <span className="text-lg font-bold">${portfolio.current_balance.toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Portfolio: {portfolio.name}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Trading Controls */}
              <div className="flex gap-2">
                {!session.isActive ? (
                  <Button
                    onClick={startTrading}
                    disabled={!tradingAmount}
                    className="flex-1 h-12"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Start {simulationMode ? 'Simulation' : 'Live Trading'}
                  </Button>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <p>Trading is active. Go to Live Trading tab to monitor and stop.</p>
                    <Button 
                      onClick={() => setActiveTab('live')} 
                      variant="outline" 
                      className="mt-2"
                    >
                      View Live Trading
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="live" className="space-y-6 mt-6">
              {/* Trading Controls in Live Tab */}
              {session.isActive && (
                <div className="flex gap-2 mb-6">
                  <Button
                    onClick={stopTrading}
                    variant="destructive"
                    className="flex-1 h-12"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop Trading
                  </Button>
                </div>
              )}

              {/* Session Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Starting Balance</div>
                    <div className="text-2xl font-bold">{formatCurrency(session.startingBalance)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Current Balance</div>
                    <div className={`text-2xl font-bold ${session.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(session.currentBalance)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Total P&L</div>
                    <div className={`text-2xl font-bold ${session.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {session.totalPnL >= 0 ? '+' : ''}{formatCurrency(session.totalPnL)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Total Trades</div>
                    <div className="text-2xl font-bold">{session.totalTrades}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Live Parameters Display */}
              {session.isActive && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Active Parameters</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Stop Loss</div>
                        <div className="font-semibold text-red-600">-{stopLoss[0]}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Take Profit</div>
                        <div className="font-semibold text-green-600">+{takeProfit[0]}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Risk Level</div>
                        <div className={`font-semibold ${getRiskLevelColor(riskLevel[0])}`}>
                          {riskLevel[0]}%
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Mode</div>
                        <Badge variant={simulationMode ? "secondary" : "default"}>
                          {simulationMode ? 'SIM' : 'LIVE'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Live Trades */}
              {session.isActive && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Active Trades
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
                        {session.activeTrades.map((trade) => {
                          const percentChange = trade.currentPrice 
                            ? ((trade.currentPrice - trade.price) / trade.price) * 100
                            : 0;
                          const actualPnLPercent = trade.action === 'BUY' ? percentChange : -percentChange;
                          
                          return (
                            <div key={trade.id} className="p-4 border rounded-lg bg-muted/30">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant={trade.action === 'BUY' ? 'default' : 'destructive'}>
                                    {trade.action}
                                  </Badge>
                                  <span className="font-bold">{trade.symbol}</span>
                                  <span className="text-sm text-muted-foreground">
                                    {trade.quantity} shares @ ${trade.price.toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">
                                    {trade.confidence}% confidence
                                  </Badge>
                                  <div className={`font-bold ${trade.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {actualPnLPercent >= 0 ? '+' : ''}{actualPnLPercent.toFixed(1)}%
                                  </div>
                                  <div className={`font-bold ${trade.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {trade.profitLoss >= 0 ? '+' : ''}${trade.profitLoss.toFixed(2)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Started: {new Date(trade.timestamp).toLocaleTimeString()}</span>
                                <span>Current: ${trade.currentPrice?.toFixed(2) || trade.price.toFixed(2)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {!session.isActive && (
                <div className="text-center py-12 text-muted-foreground">
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No Active Trading Session</h3>
                  <p>Configure your parameters and start trading to see live data here.</p>
                  <Button 
                    onClick={() => setActiveTab('config')} 
                    variant="outline" 
                    className="mt-4"
                  >
                    Go to Configuration
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Live Stock Charts - Positioned below tabs when trading is active */}
          {session.isActive && session.activeTrades.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Live Trade Charts
                </h3>
                <Badge variant="secondary" className="text-xs">
                  {session.activeTrades.length} Active
                </Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {session.activeTrades.slice(0, 4).map((trade) => (
                  <StockChart
                    key={trade.id}
                    symbol={trade.symbol}
                    currentPrice={trade.currentPrice || trade.price}
                    tradeType={trade.action}
                    className="h-[200px]"
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};