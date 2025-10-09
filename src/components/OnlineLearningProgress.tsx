import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Brain, TrendingUp, Activity, Zap, ArrowUpCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Episode {
  id: string;
  asset: string;
  version: string;
  reward_sum: number;
  pnl: number;
  start_ts: string;
  end_ts: string;
  metadata: any;
}

interface ModelMetrics {
  asset: string;
  version: string;
  win_rate: number;
  sharpe: number;
  avg_rr: number;
  max_dd: number;
  total_trades: number;
  profitable_trades: number;
  updated_at: string;
}

export function OnlineLearningProgress() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [metrics, setMetrics] = useState<ModelMetrics[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    
    // Subscribe to real-time updates
    const episodesChannel = supabase
      .channel('episodes-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'episodes' }, () => {
        loadData();
      })
      .subscribe();

    const metricsChannel = supabase
      .channel('metrics-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'model_metrics' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(episodesChannel);
      supabase.removeChannel(metricsChannel);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load recent episodes (last 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const { data: episodesData } = await supabase
        .from('episodes')
        .select('*')
        .gte('start_ts', oneDayAgo.toISOString())
        .order('start_ts', { ascending: false })
        .limit(100);

      // Load model metrics
      const { data: metricsData } = await supabase
        .from('model_metrics')
        .select('*')
        .order('updated_at', { ascending: false });

      setEpisodes(episodesData || []);
      setMetrics(metricsData || []);
    } catch (error) {
      console.error('Error loading learning data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAssets = () => {
    const assets = new Set(metrics.map(m => m.asset));
    return ['all', ...Array.from(assets)];
  };

  const getFilteredMetrics = () => {
    if (selectedAsset === 'all') return metrics;
    return metrics.filter(m => m.asset === selectedAsset);
  };

  const getFilteredEpisodes = () => {
    if (selectedAsset === 'all') return episodes;
    return episodes.filter(e => e.asset === selectedAsset);
  };

  const getRewardTrendData = () => {
    const filtered = getFilteredEpisodes();
    return filtered
      .slice(0, 20)
      .reverse()
      .map((ep, idx) => ({
        episode: idx + 1,
        reward: ep.reward_sum || 0,
        pnl: ep.pnl || 0,
        version: ep.version
      }));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Activity className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const avgMetrics = getFilteredMetrics().reduce(
    (acc, m) => ({
      winRate: acc.winRate + (m.win_rate || 0),
      sharpe: acc.sharpe + (m.sharpe || 0),
      trades: acc.trades + (m.total_trades || 0),
      count: acc.count + 1
    }),
    { winRate: 0, sharpe: 0, trades: 0, count: 0 }
  );

  const avgStats = avgMetrics.count > 0 ? {
    winRate: (avgMetrics.winRate / avgMetrics.count) * 100,
    sharpe: avgMetrics.sharpe / avgMetrics.count,
    trades: avgMetrics.trades
  } : { winRate: 0, sharpe: 0, trades: 0 };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Online PPO Learning Progress
              </CardTitle>
              <CardDescription>
                Real-time shadow model training and performance metrics
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-lg px-4 py-2">
              {getFilteredEpisodes().length} Episodes (24h)
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* Asset Filter */}
          <div className="mb-6">
            <Tabs value={selectedAsset} onValueChange={setSelectedAsset}>
              <TabsList className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-10">
                {getAssets().map(asset => (
                  <TabsTrigger key={asset} value={asset}>
                    {asset === 'all' ? 'All Assets' : asset}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Avg Win Rate</div>
              <div className="text-2xl font-bold">{avgStats.winRate.toFixed(1)}%</div>
              <TrendingUp className="h-4 w-4 text-green-500 mt-1" />
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Avg Sharpe</div>
              <div className="text-2xl font-bold">{avgStats.sharpe.toFixed(2)}</div>
              <Activity className="h-4 w-4 text-purple-500 mt-1" />
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Total Trades</div>
              <div className="text-2xl font-bold">{avgStats.trades}</div>
              <Zap className="h-4 w-4 text-green-500 mt-1" />
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Active Models</div>
              <div className="text-2xl font-bold">{getFilteredMetrics().length}</div>
              <ArrowUpCircle className="h-4 w-4 text-orange-500 mt-1" />
            </div>
          </div>

          {/* Reward Trend Chart */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4">Learning Curve (Last 20 Episodes)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={getRewardTrendData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="episode" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="reward"
                  stroke="#8884d8"
                  name="Reward"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="pnl"
                  stroke="#82ca9d"
                  name="P&L ($)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Model Performance Table */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Model Performance by Asset</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4">Asset</th>
                    <th className="text-left py-2 px-4">Version</th>
                    <th className="text-right py-2 px-4">Win Rate</th>
                    <th className="text-right py-2 px-4">Sharpe</th>
                    <th className="text-right py-2 px-4">Avg R:R</th>
                    <th className="text-right py-2 px-4">Max DD</th>
                    <th className="text-right py-2 px-4">Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {getFilteredMetrics().map((metric) => (
                    <tr key={`${metric.asset}-${metric.version}`} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-4 font-medium">{metric.asset}</td>
                      <td className="py-2 px-4">
                        <Badge variant="outline">{metric.version}</Badge>
                      </td>
                      <td className="text-right py-2 px-4">
                        <span className={metric.win_rate >= 0.5 ? 'text-green-600' : 'text-red-600'}>
                          {((metric.win_rate || 0) * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-right py-2 px-4">{(metric.sharpe || 0).toFixed(2)}</td>
                      <td className="text-right py-2 px-4">{(metric.avg_rr || 0).toFixed(2)}</td>
                      <td className="text-right py-2 px-4">
                        <span className="text-red-600">{((metric.max_dd || 0) * 100).toFixed(1)}%</span>
                      </td>
                      <td className="text-right py-2 px-4">
                        {metric.profitable_trades}/{metric.total_trades}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
