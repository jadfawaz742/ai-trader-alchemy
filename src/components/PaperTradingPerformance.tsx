import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Activity, DollarSign, Target, AlertCircle } from 'lucide-react';

interface PerformanceMetrics {
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  profitableTrades: number;
  losingTrades: number;
  avgProfit: number;
  avgLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgHoldTime: number;
  riskRewardRatio: number;
  bestTrade: number;
  worstTrade: number;
  unrealizedPnL?: number;
}

interface AssetPerformance {
  asset: string;
  pnl: number;
  trades: number;
  winRate: number;
  avgProfit: number;
}

interface DailyPnL {
  date: string;
  pnl: number;
  cumulativePnL: number;
}

export function PaperTradingPerformance() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [assetPerformance, setAssetPerformance] = useState<AssetPerformance[]>([]);
  const [dailyPnL, setDailyPnL] = useState<DailyPnL[]>([]);

  useEffect(() => {
    if (user) {
      loadPerformanceData();
    }
  }, [user, timeframe]);

  const loadPerformanceData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      if (timeframe === '7d') startDate.setDate(now.getDate() - 7);
      else if (timeframe === '30d') startDate.setDate(now.getDate() - 30);
      else if (timeframe === '90d') startDate.setDate(now.getDate() - 90);
      else startDate = new Date(0); // All time

      // Fetch closed trades
      const { data: closedTrades, error: closedError } = await supabase
        .from('paper_trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .gte('closed_at', startDate.toISOString())
        .order('closed_at', { ascending: true });

      if (closedError) throw closedError;

      // Fetch open trades for unrealized P&L
      const { data: openTrades, error: openError } = await supabase
        .from('paper_trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open');

      if (openError) throw openError;

      const trades = closedTrades || [];

      if (!trades || trades.length === 0) {
        setMetrics(null);
        setAssetPerformance([]);
        setDailyPnL([]);
        setLoading(false);
        return;
      }

      // Calculate overall metrics
      const totalTrades = trades.length;
      const profitableTrades = trades.filter(t => (t.pnl || 0) > 0).length;
      const losingTrades = trades.filter(t => (t.pnl || 0) < 0).length;
      const totalPnL = trades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
      const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;

      const profits = trades.filter(t => (t.pnl || 0) > 0).map(t => Number(t.pnl));
      const losses = trades.filter(t => (t.pnl || 0) < 0).map(t => Number(t.pnl));
      const avgProfit = profits.length > 0 ? profits.reduce((a, b) => a + b, 0) / profits.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;

      const bestTrade = Math.max(...trades.map(t => Number(t.pnl) || 0));
      const worstTrade = Math.min(...trades.map(t => Number(t.pnl) || 0));

      // Calculate max drawdown
      let peak = 0;
      let maxDD = 0;
      let cumulative = 0;
      trades.forEach(t => {
        cumulative += Number(t.pnl) || 0;
        if (cumulative > peak) peak = cumulative;
        const drawdown = peak - cumulative;
        if (drawdown > maxDD) maxDD = drawdown;
      });

      // Calculate Sharpe ratio (simplified)
      const returns = trades.map(t => Number(t.pnl) || 0);
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
      const sharpeRatio = stdDev !== 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

      // Calculate average hold time
      const holdTimes = trades
        .filter(t => t.created_at && t.closed_at)
        .map(t => new Date(t.closed_at!).getTime() - new Date(t.created_at).getTime());
      const avgHoldTime = holdTimes.length > 0 ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length / (1000 * 60) : 0;

      // Risk/Reward ratio
      const riskRewardRatio = avgLoss !== 0 ? Math.abs(avgProfit / avgLoss) : 0;

      // Calculate unrealized P&L from open trades
      const unrealizedPnL = (openTrades || []).reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);

      setMetrics({
        totalPnL,
        winRate,
        totalTrades,
        profitableTrades,
        losingTrades,
        avgProfit,
        avgLoss,
        maxDrawdown: maxDD,
        sharpeRatio,
        avgHoldTime,
        riskRewardRatio,
        bestTrade,
        worstTrade,
        unrealizedPnL,
      });

      // Calculate per-asset performance
      const assetMap = new Map<string, { pnl: number; trades: number; wins: number }>();
      trades.forEach(t => {
        const existing = assetMap.get(t.asset) || { pnl: 0, trades: 0, wins: 0 };
        assetMap.set(t.asset, {
          pnl: existing.pnl + (Number(t.pnl) || 0),
          trades: existing.trades + 1,
          wins: existing.wins + ((Number(t.pnl) || 0) > 0 ? 1 : 0),
        });
      });

      const assetPerf: AssetPerformance[] = Array.from(assetMap.entries()).map(([asset, data]) => ({
        asset,
        pnl: data.pnl,
        trades: data.trades,
        winRate: (data.wins / data.trades) * 100,
        avgProfit: data.pnl / data.trades,
      })).sort((a, b) => b.pnl - a.pnl);

      setAssetPerformance(assetPerf);

      // Calculate daily P&L
      const dailyMap = new Map<string, number>();
      trades.forEach(t => {
        if (t.closed_at) {
          const date = new Date(t.closed_at).toISOString().split('T')[0];
          dailyMap.set(date, (dailyMap.get(date) || 0) + (Number(t.pnl) || 0));
        }
      });

      let cumPnL = 0;
      const dailyData: DailyPnL[] = Array.from(dailyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, pnl]) => {
          cumPnL += pnl;
          return { date, pnl, cumulativePnL: cumPnL };
        });

      setDailyPnL(dailyData);

    } catch (error: any) {
      console.error('Error loading performance data:', error);
      toast.error('Failed to load performance data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading performance data...</div>;
  }

  if (!metrics) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No closed trades yet. Performance metrics will appear once you have closed paper trades.</p>
        </CardContent>
      </Card>
    );
  }

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--destructive))', 'hsl(var(--warning))'];

  return (
    <div className="space-y-4">
      {/* Timeframe Selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Paper Trading Performance</h2>
        <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as any)}>
          <TabsList>
            <TabsTrigger value="7d">7 Days</TabsTrigger>
            <TabsTrigger value="30d">30 Days</TabsTrigger>
            <TabsTrigger value="90d">90 Days</TabsTrigger>
            <TabsTrigger value="all">All Time</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Realized P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.totalPnL >= 0 ? 'text-success' : 'text-destructive'}`}>
              ${metrics.totalPnL.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Best: ${metrics.bestTrade.toFixed(2)} | Worst: ${metrics.worstTrade.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Unrealized P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(metrics.unrealizedPnL || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
              ${(metrics.unrealizedPnL || 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From open positions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.winRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.profitableTrades}W / {metrics.losingTrades}L of {metrics.totalTrades}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Sharpe Ratio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.sharpeRatio.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Max DD: ${metrics.maxDrawdown.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Risk/Reward
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.riskRewardRatio.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg Hold: {metrics.avgHoldTime.toFixed(0)} min
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="cumulative" className="w-full">
        <TabsList>
          <TabsTrigger value="cumulative">Cumulative P&L</TabsTrigger>
          <TabsTrigger value="daily">Daily P&L</TabsTrigger>
          <TabsTrigger value="assets">By Asset</TabsTrigger>
        </TabsList>

        <TabsContent value="cumulative">
          <Card>
            <CardHeader>
              <CardTitle>Cumulative P&L Over Time</CardTitle>
              <CardDescription>Your portfolio growth trajectory</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyPnL}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }} 
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="cumulativePnL" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    name="Cumulative P&L"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily">
          <Card>
            <CardHeader>
              <CardTitle>Daily P&L</CardTitle>
              <CardDescription>Daily profit and loss breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyPnL}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }} 
                  />
                  <Legend />
                  <Bar 
                    dataKey="pnl" 
                    fill="hsl(var(--primary))" 
                    name="Daily P&L"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets">
          <Card>
            <CardHeader>
              <CardTitle>Performance by Asset</CardTitle>
              <CardDescription>Which assets are most profitable</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {assetPerformance.map((asset, idx) => (
                  <div key={asset.asset} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      <div>
                        <p className="font-medium">{asset.asset}</p>
                        <p className="text-xs text-muted-foreground">
                          {asset.trades} trades • {asset.winRate.toFixed(1)}% win rate
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${asset.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                        ${asset.pnl.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ${asset.avgProfit.toFixed(2)} avg
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Trade Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Trade Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Avg Profit</p>
              <p className="text-xl font-bold text-success">${metrics.avgProfit.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Loss</p>
              <p className="text-xl font-bold text-destructive">${metrics.avgLoss.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Trades</p>
              <p className="text-xl font-bold">{metrics.totalTrades}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Hold Time</p>
              <p className="text-xl font-bold">{metrics.avgHoldTime.toFixed(0)} min</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
