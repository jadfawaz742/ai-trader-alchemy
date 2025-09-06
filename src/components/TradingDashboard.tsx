import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, DollarSign, PieChart, Activity, Target, Shield } from 'lucide-react';

interface Portfolio {
  id: string;
  name: string;
  current_balance: number;
  initial_balance: number;
  total_pnl: number;
}

interface Position {
  id: string;
  symbol: string;
  quantity: number;
  average_price: number;
  current_price: number;
  current_value: number;
  unrealized_pnl: number;
}

interface Trade {
  id: string;
  symbol: string;
  trade_type: string;
  quantity: number;
  price: number;
  total_amount: number;
  ppo_signal: any;
  risk_score: number;
  executed_at: string;
}

interface RiskParams {
  max_position_size: number;
  ppo_buy_threshold: number;
  ppo_sell_threshold: number;
  stop_loss_percent: number;
  take_profit_percent: number;
}

const TradingDashboard: React.FC = () => {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [riskParams, setRiskParams] = useState<RiskParams | null>(null);
  const [loading, setLoading] = useState(false);
  const [tradeForm, setTradeForm] = useState({
    symbol: '',
    tradeType: 'BUY',
    quantity: '',
    currentPrice: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load portfolio data
      const { data: portfolioData } = await supabase
        .from('portfolios')
        .select('*')
        .limit(1)
        .single();

      if (portfolioData) {
        setPortfolio(portfolioData);
        
        // Load positions
        const { data: positionsData } = await supabase
          .from('positions')
          .select('*')
          .eq('portfolio_id', portfolioData.id);
        
        setPositions(positionsData || []);
        
        // Load recent trades
        const { data: tradesData } = await supabase
          .from('trades')
          .select('*')
          .eq('portfolio_id', portfolioData.id)
          .order('executed_at', { ascending: false })
          .limit(10);
        
        setRecentTrades(tradesData || []);
        
        // Load risk parameters
        const { data: riskData } = await supabase
          .from('risk_parameters')
          .select('*')
          .eq('portfolio_id', portfolioData.id)
          .single();
        
        setRiskParams(riskData);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    }
  };

  const executeTrade = async () => {
    if (!portfolio || !tradeForm.symbol || !tradeForm.quantity || !tradeForm.currentPrice) {
      toast({
        title: "Error",
        description: "Please fill in all trade fields",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: {
          portfolioId: portfolio.id,
          symbol: tradeForm.symbol.toUpperCase(),
          tradeType: tradeForm.tradeType,
          quantity: parseInt(tradeForm.quantity),
          currentPrice: parseFloat(tradeForm.currentPrice)
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Trade Executed",
          description: data.message,
        });
        
        // Reset form and reload data
        setTradeForm({
          symbol: '',
          tradeType: 'BUY',
          quantity: '',
          currentPrice: ''
        });
        await loadDashboardData();
      } else {
        toast({
          title: "Trade Rejected",
          description: data.reason || data.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error executing trade:', error);
      toast({
        title: "Error",
        description: "Failed to execute trade",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (value: number) => {
    return value >= 0 ? (
      <TrendingUp className="h-4 w-4 text-green-500" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-500" />
    );
  };

  const getTradeVariant = (tradeType: string) => {
    return tradeType === 'BUY' ? 'default' : 'secondary';
  };

  if (!portfolio) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">Loading trading dashboard...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPositionValue = positions.reduce((sum, pos) => sum + (pos.current_value || 0), 0);
  const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);
  const portfolioReturn = ((portfolio.current_balance + totalPositionValue - portfolio.initial_balance) / portfolio.initial_balance) * 100;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">AI Trading Dashboard</h1>
        <Badge variant="outline" className="text-lg px-4 py-2">
          <Activity className="h-4 w-4 mr-2" />
          PPO Risk Management Active
        </Badge>
      </div>

      {/* Portfolio Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(portfolio.current_balance + totalPositionValue).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Cash: ${portfolio.current_balance.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Return</CardTitle>
            {getTrendIcon(portfolioReturn)}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${portfolioReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {portfolioReturn >= 0 ? '+' : ''}{portfolioReturn.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">
              ${((portfolio.current_balance + totalPositionValue) - portfolio.initial_balance).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Positions</CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{positions.length}</div>
            <p className="text-xs text-muted-foreground">
              Value: ${totalPositionValue.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unrealized P&L</CardTitle>
            {getTrendIcon(totalUnrealizedPnL)}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalUnrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalUnrealizedPnL >= 0 ? '+' : ''}${totalUnrealizedPnL.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Today's change
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="trade" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="trade">Execute Trade</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="history">Trade History</TabsTrigger>
          <TabsTrigger value="settings">Risk Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="trade" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="h-5 w-5 mr-2" />
                Execute Trade with PPO Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium">Symbol</label>
                  <Input
                    placeholder="e.g. AAPL"
                    value={tradeForm.symbol}
                    onChange={(e) => setTradeForm({...tradeForm, symbol: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <select
                    value={tradeForm.tradeType}
                    onChange={(e) => setTradeForm({...tradeForm, tradeType: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Quantity</label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={tradeForm.quantity}
                    onChange={(e) => setTradeForm({...tradeForm, quantity: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Current Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="150.00"
                    value={tradeForm.currentPrice}
                    onChange={(e) => setTradeForm({...tradeForm, currentPrice: e.target.value})}
                  />
                </div>
              </div>
              <Button onClick={executeTrade} disabled={loading} className="w-full">
                {loading ? 'Executing...' : `Execute ${tradeForm.tradeType} Order`}
              </Button>
              
              {riskParams && (
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium flex items-center mb-2">
                    <Shield className="h-4 w-4 mr-2" />
                    Risk Management Rules
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Max Position Size: {riskParams.max_position_size}%</div>
                    <div>PPO Buy Threshold: {riskParams.ppo_buy_threshold}</div>
                    <div>PPO Sell Threshold: {riskParams.ppo_sell_threshold}</div>
                    <div>Stop Loss: {riskParams.stop_loss_percent}%</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Positions</CardTitle>
            </CardHeader>
            <CardContent>
              {positions.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No active positions
                </div>
              ) : (
                <div className="space-y-4">
                  {positions.map((position) => (
                    <div key={position.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <h3 className="font-medium">{position.symbol}</h3>
                        <p className="text-sm text-muted-foreground">
                          {position.quantity} shares @ ${position.average_price?.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          ${(position.current_value || 0).toLocaleString()}
                        </div>
                        <div className={`text-sm ${(position.unrealized_pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {(position.unrealized_pnl || 0) >= 0 ? '+' : ''}${(position.unrealized_pnl || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Trades</CardTitle>
            </CardHeader>
            <CardContent>
              {recentTrades.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No trades yet
                </div>
              ) : (
                <div className="space-y-4">
                  {recentTrades.map((trade) => (
                    <div key={trade.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <Badge variant={getTradeVariant(trade.trade_type)}>
                            {trade.trade_type}
                          </Badge>
                          <span className="font-medium">{trade.symbol}</span>
                          <span className="text-sm text-muted-foreground">
                            {trade.quantity} @ ${trade.price}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(trade.executed_at).toLocaleString()}
                          {trade.ppo_signal && (
                            <span className="ml-2">
                              PPO: {trade.ppo_signal.ppoLine} | Risk: {trade.risk_score}%
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right font-medium">
                        ${trade.total_amount.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="h-5 w-5 mr-2" />
                Risk Management Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {riskParams ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">Position Limits</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Max Position Size:</span>
                          <span>{riskParams.max_position_size}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Stop Loss:</span>
                          <span>{riskParams.stop_loss_percent}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Take Profit:</span>
                          <span>{riskParams.take_profit_percent}%</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">PPO Settings</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Buy Threshold:</span>
                          <span>{riskParams.ppo_buy_threshold}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sell Threshold:</span>
                          <span>{riskParams.ppo_sell_threshold}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-medium mb-2">PPO Explanation</h4>
                    <p className="text-sm text-muted-foreground">
                      The Percentage Price Oscillator (PPO) is a momentum indicator that shows the relationship 
                      between two moving averages. Our AI uses PPO signals to validate trades and manage risk. 
                      Positive PPO values suggest upward momentum (good for buying), while negative values 
                      suggest downward momentum (good for selling).
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Risk parameters not configured
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TradingDashboard;