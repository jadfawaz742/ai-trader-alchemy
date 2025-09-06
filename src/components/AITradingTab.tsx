import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Bot, Play, Square, TrendingUp, AlertTriangle, DollarSign, Target, Shield } from 'lucide-react';

interface TradeStatus {
  isActive: boolean;
  currentAmount: number;
  tradesExecuted: number;
  profitLoss: number;
  lastTradeTime: string;
  activeTrades: any[];
}

export const AITradingTab: React.FC = () => {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [tradingAmount, setTradingAmount] = useState('1000');
  const [riskLevel, setRiskLevel] = useState([50]);
  const [simulationMode, setSimulationMode] = useState(true);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeStatus, setTradeStatus] = useState<TradeStatus>({
    isActive: false,
    currentAmount: 0,
    tradesExecuted: 0,
    profitLoss: 0,
    lastTradeTime: '',
    activeTrades: []
  });
  const [tradingInterval, setTradingInterval] = useState<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPortfolio();
  }, []);

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

  const startTrading = async () => {
    if (!portfolio) {
      toast({
        title: "Error",
        description: "No portfolio found",
        variant: "destructive"
      });
      return;
    }

    setIsTrading(true);
    setTradeStatus(prev => ({ ...prev, isActive: true }));

    try {
      const { data, error } = await supabase.functions.invoke('auto-trade', {
        body: {
          portfolioId: portfolio.id,
          simulationMode,
          riskLevel: riskLevel[0],
          maxAmount: parseFloat(tradingAmount)
        }
      });

      if (error) throw error;

      if (data.success) {
        setTradeStatus(prev => ({
          ...prev,
          tradesExecuted: data.tradesExecuted,
          profitLoss: data.totalProfitLoss,
          lastTradeTime: new Date().toISOString(),
          activeTrades: data.trades || []
        }));

        toast({
          title: `${simulationMode ? 'Simulated' : 'Live'} Trading Complete`,
          description: data.message
        });
      }
    } catch (error) {
      console.error('Error starting trading:', error);
      toast({
        title: "Error",
        description: "Failed to start AI trading",
        variant: "destructive"
      });
    } finally {
      setIsTrading(false);
      setTradeStatus(prev => ({ ...prev, isActive: false }));
    }
  };

  const stopTrading = () => {
    if (tradingInterval) {
      clearInterval(tradingInterval);
      setTradingInterval(null);
    }
    setIsTrading(false);
    setTradeStatus(prev => ({ ...prev, isActive: false }));
    
    toast({
      title: "Trading Stopped",
      description: "AI trading has been stopped"
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Trading Assistant
          </CardTitle>
          <CardDescription>
            Let AI handle your trades with advanced risk management and market analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Trading Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Trading Amount ($)</Label>
            <Input
              id="amount"
              type="number"
              value={tradingAmount}
              onChange={(e) => setTradingAmount(e.target.value)}
              placeholder="Enter amount to trade"
              min="1"
              max="10000"
            />
            <p className="text-sm text-muted-foreground">
              Maximum amount the AI can use per trade
            </p>
          </div>

          {/* Risk Level */}
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
              className="w-full"
            />
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div className="text-left">Conservative (1-30%)</div>
              <div className="text-center">Moderate (31-70%)</div>
              <div className="text-right">Aggressive (71-100%)</div>
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

          {/* Trading Controls */}
          <div className="flex gap-2">
            {!tradeStatus.isActive ? (
              <Button
                onClick={startTrading}
                disabled={isTrading || !tradingAmount}
                className="flex-1 h-12"
              >
                <Play className="h-4 w-4 mr-2" />
                {isTrading ? 'Starting...' : `Start ${simulationMode ? 'Simulation' : 'Live Trading'}`}
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

          {/* Trading Status */}
          {(tradeStatus.tradesExecuted > 0 || tradeStatus.isActive) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Trading Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Trades Executed</div>
                    <div className="text-2xl font-bold">{tradeStatus.tradesExecuted}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Profit/Loss</div>
                    <div className={`text-2xl font-bold ${tradeStatus.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tradeStatus.profitLoss >= 0 ? '+' : ''}${tradeStatus.profitLoss.toFixed(2)}
                    </div>
                  </div>
                </div>

                {tradeStatus.isActive && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium">AI is actively trading</span>
                    </div>
                    <Progress value={85} className="w-full" />
                  </div>
                )}

                {tradeStatus.activeTrades.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Recent Trades</div>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {tradeStatus.activeTrades.slice(0, 3).map((trade, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant={trade.action === 'BUY' ? 'default' : 'secondary'}>
                              {trade.action}
                            </Badge>
                            <span>{trade.symbol}</span>
                            <span className="text-muted-foreground">{trade.quantity} shares</span>
                          </div>
                          <div className={`font-medium ${trade.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {trade.profitLoss >= 0 ? '+' : ''}${trade.profitLoss.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Risk Disclaimer */}
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-yellow-800 mb-1">Risk Disclaimer</div>
                <div className="text-yellow-700">
                  {simulationMode 
                    ? 'This is a simulation mode for testing purposes. No real money is involved.'
                    : 'Live trading involves real money and risk. Past performance does not guarantee future results. Only trade with money you can afford to lose.'
                  }
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};