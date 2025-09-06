import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, DollarSign, PieChart, BarChart3, RefreshCw } from 'lucide-react';

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

export const PortfolioDashboard: React.FC = () => {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPortfolioData = async () => {
    setLoading(true);
    try {
      // Load portfolio
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
          .eq('portfolio_id', portfolioData.id)
          .gt('quantity', 0);

        setPositions(positionsData || []);

        // Load recent trades
        const { data: tradesData } = await supabase
          .from('trades')
          .select('*')
          .eq('portfolio_id', portfolioData.id)
          .order('executed_at', { ascending: false })
          .limit(10);

        setRecentTrades(tradesData || []);
      }
    } catch (error) {
      console.error('Error loading portfolio data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortfolioData();
  }, []);

  const totalPortfolioValue = portfolio ? portfolio.current_balance + positions.reduce((sum, pos) => sum + pos.current_value, 0) : 0;
  const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + pos.unrealized_pnl, 0);
  const totalReturnPercent = portfolio ? ((totalPortfolioValue - portfolio.initial_balance) / portfolio.initial_balance) * 100 : 0;

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
            <Button variant="outline" size="sm" onClick={loadPortfolioData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
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
                <div className="text-sm text-muted-foreground">Unrealized P&L</div>
                <div className={`text-2xl font-bold ${totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totalUnrealizedPnl)}
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
                  <div className="space-y-1">
                    <div className="font-semibold text-lg">{position.symbol}</div>
                    <div className="text-sm text-muted-foreground">
                      {position.quantity} shares @ {formatCurrency(position.average_price)}
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="font-semibold">{formatCurrency(position.current_value)}</div>
                    <div className={`text-sm flex items-center gap-1 ${position.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {position.unrealized_pnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {formatCurrency(position.unrealized_pnl)}
                    </div>
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