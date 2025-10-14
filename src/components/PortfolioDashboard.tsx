import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePortfolioContext } from '@/components/PortfolioProvider';
import { useAuth } from '@/hooks/useAuth';
import { TrendingUp, TrendingDown, DollarSign, PieChart, BarChart3, RefreshCw, ShoppingCart, Minus, Wallet } from 'lucide-react';

interface Portfolio {
  id: string;
  name: string;
  initial_balance: number;
  current_balance: number;
  total_pnl: number;
  created_at: string;
}

interface Position {
  id: string;
  symbol: string;
  quantity: number;
  average_price: number;
  current_price: number;
  current_value: number;
  unrealized_pnl: number;
  total_cost: number;
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

interface BinanceBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export const PortfolioDashboard: React.FC = () => {
  const { user } = useAuth();
  const { portfolio, positions, recentTrades, loading, addTrade } = usePortfolioContext();
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [tradeQuantity, setTradeQuantity] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [isTrading, setIsTrading] = useState(false);
  const [binanceBalances, setBinanceBalances] = useState<BinanceBalance[]>([]);
  const [loadingBinance, setLoadingBinance] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      loadBinancePortfolio();
    }
  }, [user]);

  const loadBinancePortfolio = async () => {
    setLoadingBinance(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-binance-portfolio');
      
      if (error) throw error;
      
      if (data?.error) {
        console.error('Binance portfolio error:', data.error);
        toast({
          title: "Binance Connection Issue",
          description: data.error,
          variant: "destructive"
        });
        setBinanceBalances([]);
        return;
      }
      
      if (data?.balances) {
        setBinanceBalances(data.balances);
      }
    } catch (error) {
      console.error('Error loading Binance portfolio:', error);
      toast({
        title: "Failed to Load Binance Portfolio",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setLoadingBinance(false);
    }
  };


// Calculate portfolio values properly
const positionsValue = positions.reduce((sum, pos) => sum + (pos.current_value || 0), 0);
const totalPortfolioValue = portfolio ? portfolio.current_balance + positionsValue : 0;
const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);
// Total P&L should be: (current portfolio value) - (initial balance)
const totalPnL = portfolio ? totalPortfolioValue - portfolio.initial_balance : 0;
const totalReturnPercent = portfolio && portfolio.initial_balance > 0 ? (totalPnL / portfolio.initial_balance) * 100 : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatPercent = (percent: number) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  const getTradeTypeVariant = (tradeType: string) => {
    return tradeType === 'BUY' ? 'default' : 'secondary';
  };

  const getRiskScoreColor = (riskScore: number) => {
    if (riskScore <= 30) return 'text-green-600';
    if (riskScore <= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const handleQuickTrade = async (position: Position, action: 'BUY' | 'SELL') => {
    if (!portfolio) return;
    
    setSelectedPosition(position);
    setTradeQuantity(action === 'SELL' ? position.quantity.toString() : '1');
    setTradePrice(position.current_price?.toString() || '0');
  };

  const executeTrade = async (action: 'BUY' | 'SELL') => {
    if (!selectedPosition || !portfolio || !tradeQuantity || !tradePrice || !addTrade) return;
    
    setIsTrading(true);
    try {
      // Use the unified addTrade function from portfolio context
      await addTrade({
        symbol: selectedPosition.symbol,
        trade_type: action,
        quantity: parseInt(tradeQuantity),
        price: parseFloat(tradePrice),
        total_amount: parseFloat(tradePrice) * parseInt(tradeQuantity),
        risk_score: 30, // Low risk for manual portfolio trades
        ppo_signal: { platform: 'manual_portfolio' }
      });

      toast({
        title: "Trade Executed!",
        description: `${action} ${tradeQuantity} shares of ${selectedPosition.symbol} at $${tradePrice}`
      });
      
      setSelectedPosition(null);
      setTradeQuantity('');
      setTradePrice('');
    } catch (error) {
      console.error('Error executing trade:', error);
      toast({
        title: "Trade Failed",
        description: error.message || "Failed to execute trade",
        variant: "destructive"
      });
    } finally {
      setIsTrading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading portfolio data...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Binance Portfolio */}
      {binanceBalances.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Binance Portfolio
                </CardTitle>
                <CardDescription>
                  Your real Binance account balances
                </CardDescription>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={loadBinancePortfolio}
                disabled={loadingBinance}
              >
                <RefreshCw className={`h-4 w-4 ${loadingBinance ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {binanceBalances.map((balance) => (
                <div key={balance.asset} className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    {balance.asset}
                  </div>
                  <div className="text-xl font-bold">
                    {balance.total.toFixed(8)}
                  </div>
                  {balance.locked > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Locked: {balance.locked.toFixed(8)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Portfolio Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Portfolio Overview
              </CardTitle>
              <CardDescription>
                {portfolio?.name || 'Demo Portfolio'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {portfolio && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Total Value</div>
                <div className="text-2xl font-bold">{formatCurrency(totalPortfolioValue)}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Cash Balance</div>
                <div className="text-2xl font-bold">{formatCurrency(portfolio.current_balance)}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Total Return</div>
                <div className={`text-2xl font-bold flex items-center gap-1 ${totalReturnPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalReturnPercent >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  {formatPercent(totalReturnPercent)}
                </div>
              </div>
<div className="space-y-2">
  <div className="text-sm text-muted-foreground">Total P&L</div>
  <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
    {formatCurrency(totalPnL)}
  </div>
</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Positions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Current Positions
          </CardTitle>
          <CardDescription>
            Your active stock positions with real-time P&L
          </CardDescription>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No positions found. Start trading to see your positions here.
            </div>
          ) : (
            <div className="space-y-4">
              {positions.map((position) => (
                <div key={position.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1 flex-1">
                    <div className="font-semibold text-lg">{position.symbol}</div>
                    <div className="text-sm text-muted-foreground">
                      {position.quantity} shares @ {formatCurrency(position.average_price)}
                    </div>
                  </div>
                  <div className="text-right space-y-1 flex-1">
                    <div className="font-semibold">{formatCurrency(position.current_value)}</div>
                    <div className={`text-sm flex items-center gap-1 justify-end ${position.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {position.unrealized_pnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {formatCurrency(position.unrealized_pnl)}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleQuickTrade(position, 'BUY')}
                        >
                          <ShoppingCart className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Buy More {selectedPosition?.symbol}</DialogTitle>
                          <DialogDescription>
                            Add to your existing position
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Quantity</Label>
                            <Input
                              type="number"
                              value={tradeQuantity}
                              onChange={(e) => setTradeQuantity(e.target.value)}
                              placeholder="Number of shares"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Price per Share</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={tradePrice}
                              onChange={(e) => setTradePrice(e.target.value)}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              onClick={() => executeTrade('BUY')}
                              disabled={isTrading || !tradeQuantity || !tradePrice}
                              className="flex-1"
                            >
                              {isTrading ? 'Processing...' : 'Buy Shares'}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleQuickTrade(position, 'SELL')}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Sell {selectedPosition?.symbol}</DialogTitle>
                          <DialogDescription>
                            Reduce or close your position
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Quantity (Max: {selectedPosition?.quantity})</Label>
                            <Input
                              type="number"
                              value={tradeQuantity}
                              onChange={(e) => setTradeQuantity(e.target.value)}
                              max={selectedPosition?.quantity}
                              placeholder="Number of shares"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Price per Share</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={tradePrice}
                              onChange={(e) => setTradePrice(e.target.value)}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              onClick={() => executeTrade('SELL')}
                              disabled={isTrading || !tradeQuantity || !tradePrice}
                              variant="destructive"
                              className="flex-1"
                            >
                              {isTrading ? 'Processing...' : 'Sell Shares'}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Recent Trades
          </CardTitle>
          <CardDescription>
            Your latest trading activity with PPO signals and risk scores
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentTrades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No trades yet. Execute your first trade to see history here.
            </div>
          ) : (
            <div className="space-y-4">
              {recentTrades.map((trade) => (
                <div key={trade.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={getTradeTypeVariant(trade.trade_type)}>
                        {trade.trade_type}
                      </Badge>
                      <span className="font-semibold">{trade.symbol}</span>
                      <span className="text-muted-foreground">
                        {trade.quantity} @ {formatCurrency(trade.price)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {trade.ppo_signal && (
                        <div className="flex items-center gap-1">
                          PPO Signal: <Badge variant="outline" className="text-xs">{trade.ppo_signal.signal}</Badge>
                        </div>
                      )}
                      <div className={`flex items-center gap-1 ${getRiskScoreColor(trade.risk_score)}`}>
                        Risk: {trade.risk_score}%
                      </div>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="font-semibold">{formatCurrency(trade.total_amount)}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(trade.executed_at).toLocaleDateString()}
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