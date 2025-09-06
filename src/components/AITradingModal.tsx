import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Bot, Play, Square, TrendingUp, AlertTriangle, DollarSign, Target, Shield } from 'lucide-react';

interface AITradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolio: any;
  onTradeComplete: () => void;
}

interface TradeStatus {
  isActive: boolean;
  currentAmount: number;
  tradesExecuted: number;
  profitLoss: number;
  lastTradeTime: string;
  activeTrades: any[];
}

const AITradingModal: React.FC<AITradingModalProps> = ({ 
  isOpen, 
  onClose, 
  portfolio, 
  onTradeComplete 
}) => {
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

  const getRiskLevel = () => {
    const level = riskLevel[0];
    if (level <= 30) return { label: 'Conservative', color: 'text-green-600', confidence: 85 };
    if (level <= 60) return { label: 'Moderate', color: 'text-yellow-600', confidence: 75 };
    return { label: 'Aggressive', color: 'text-red-600', confidence: 65 };
  };

  const startAITrading = async () => {
    if (!portfolio || !tradingAmount) {
      toast({
        title: "Error",
        description: "Please enter a valid trading amount",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(tradingAmount);
    if (amount <= 0 || amount > portfolio.current_balance) {
      toast({
        title: "Error",
        description: `Trading amount must be between $1 and $${portfolio.current_balance}`,
        variant: "destructive",
      });
      return;
    }

    setIsTrading(true);
    setTradeStatus({
      isActive: true,
      currentAmount: amount,
      tradesExecuted: 0,
      profitLoss: 0,
      lastTradeTime: new Date().toLocaleTimeString(),
      activeTrades: []
    });

    toast({
      title: `AI Trading ${simulationMode ? 'Simulation' : 'Live'} Started`,
      description: `Trading with $${amount} at ${getRiskLevel().label.toLowerCase()} risk`,
    });

    // Start continuous trading with intervals
    const interval = setInterval(async () => {
      await executeAITradingCycle();
    }, 30000); // Every 30 seconds

    setTradingInterval(interval);
    
    // Execute first trade immediately
    await executeAITradingCycle();
  };

  const executeAITradingCycle = async () => {
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

      if (data.success && data.trades?.length > 0) {
        setTradeStatus(prev => ({
          ...prev,
          tradesExecuted: prev.tradesExecuted + data.tradesExecuted,
          profitLoss: prev.profitLoss + (data.totalProfitLoss || 0),
          lastTradeTime: new Date().toLocaleTimeString(),
          activeTrades: data.trades
        }));

        toast({
          title: "AI Trade Executed",
          description: `${data.tradesExecuted} trades completed. ${simulationMode ? 'Simulated' : 'Live'} P&L updated.`,
        });
      }
    } catch (error) {
      console.error('AI Trading cycle error:', error);
    }
  };

  const stopAITrading = () => {
    if (tradingInterval) {
      clearInterval(tradingInterval);
      setTradingInterval(null);
    }
    
    setIsTrading(false);
    setTradeStatus(prev => ({ ...prev, isActive: false }));
    
    toast({
      title: "AI Trading Stopped",
      description: `Final stats: ${tradeStatus.tradesExecuted} trades executed, ${tradeStatus.profitLoss >= 0 ? '+' : ''}$${tradeStatus.profitLoss.toFixed(2)} P&L`,
    });

    onTradeComplete();
  };

  const handleClose = () => {
    if (isTrading) {
      stopAITrading();
    }
    onClose();
  };

  const riskInfo = getRiskLevel();

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Bot className="h-5 w-5 mr-2" />
            AI Trading Assistant
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Trading Status Display */}
          {tradeStatus.isActive && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center">
                    <TrendingUp className="h-4 w-4 mr-2 text-green-600" />
                    AI Trading Active
                  </h3>
                  <Badge variant={simulationMode ? "secondary" : "default"}>
                    {simulationMode ? 'SIMULATION' : 'LIVE'}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Amount</div>
                    <div className="font-medium">${tradeStatus.currentAmount}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Trades</div>
                    <div className="font-medium">{tradeStatus.tradesExecuted}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">P&L</div>
                    <div className={`font-medium ${tradeStatus.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tradeStatus.profitLoss >= 0 ? '+' : ''}${tradeStatus.profitLoss.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Last Trade</div>
                    <div className="font-medium text-xs">{tradeStatus.lastTradeTime}</div>
                  </div>
                </div>

                {tradeStatus.activeTrades.length > 0 && (
                  <div className="mt-3">
                    <div className="text-sm font-medium mb-2">Recent Trades:</div>
                    <div className="space-y-1">
                      {tradeStatus.activeTrades.slice(0, 3).map((trade, index) => (
                        <div key={index} className="text-xs flex justify-between items-center p-2 bg-white rounded">
                          <span>{trade.action} {trade.quantity} {trade.symbol}</span>
                          <span className="font-medium">${trade.price}</span>
                          <Badge variant="outline" className="text-xs">
                            {trade.confidence}%
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Trading Configuration */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="simulation">Simulation Mode</Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="simulation"
                  checked={simulationMode}
                  onCheckedChange={setSimulationMode}
                  disabled={isTrading}
                />
                <span className="text-sm text-muted-foreground">
                  {simulationMode ? 'Test Mode' : 'Live Trading'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Trading Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="amount"
                  type="number"
                  placeholder="1000"
                  value={tradingAmount}
                  onChange={(e) => setTradingAmount(e.target.value)}
                  disabled={isTrading}
                  className="pl-10"
                />
              </div>
              <div className="text-sm text-muted-foreground">
                Available: ${portfolio?.current_balance?.toLocaleString() || 0}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Risk Level</Label>
                <Badge variant="outline" className={riskInfo.color}>
                  {riskInfo.label}
                </Badge>
              </div>
              <Slider
                value={riskLevel}
                onValueChange={setRiskLevel}
                max={100}
                step={10}
                disabled={isTrading}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Conservative</span>
                <span>Moderate</span>
                <span>Aggressive</span>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center space-x-2 text-sm">
                  <Target className="h-4 w-4" />
                  <span>Min Confidence Required: {riskInfo.confidence}%</span>
                </div>
                <div className="flex items-center space-x-2 text-sm mt-1">
                  <Shield className="h-4 w-4" />
                  <span>
                    {riskLevel[0] <= 30 && "Conservative: Lower risk, fewer trades, higher confidence required"}
                    {riskLevel[0] > 30 && riskLevel[0] <= 60 && "Moderate: Balanced risk, moderate trade frequency"}
                    {riskLevel[0] > 60 && "Aggressive: Higher risk, more trades, lower confidence threshold"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            {!isTrading ? (
              <Button onClick={startAITrading} className="flex-1">
                <Play className="h-4 w-4 mr-2" />
                Start AI Trading
              </Button>
            ) : (
              <Button onClick={stopAITrading} variant="destructive" className="flex-1">
                <Square className="h-4 w-4 mr-2" />
                Stop Trading
              </Button>
            )}
            <Button onClick={handleClose} variant="outline">
              Close
            </Button>
          </div>

          {/* Warning Notice */}
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-800">Important Notice:</p>
                <p className="text-yellow-700 mt-1">
                  {simulationMode 
                    ? "Simulation mode uses virtual money for testing. No real trades will be executed."
                    : "Live trading mode will execute real trades with actual money. Monitor your positions carefully."
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AITradingModal;