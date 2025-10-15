import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Target, Timer, DollarSign, BarChart3, Activity, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BacktestTrade {
  id: string;
  date: string;
  action: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  confidence: number;
  rsi: number;
  macd: number;
  volumeSpike: boolean;
  fibLevel: number;
  pnl?: number;
  closePrice?: number;
  closeDate?: string;
  duration?: number;
  outcome: 'win' | 'loss' | 'open';
}

interface BacktestResults {
  symbol: string;
  period: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  successRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  trades: BacktestTrade[];
  equityCurve: Array<{ date: string; value: number; drawdown: number }>;
}

const BacktestAnalyzer: React.FC = () => {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('3months');
  const [selectedRisk, setSelectedRisk] = useState<'low' | 'medium' | 'high'>('medium');
  const [isRunning, setIsRunning] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0, percentage: 0 });
  const [results, setResults] = useState<BacktestResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trainedAssets, setTrainedAssets] = useState<string[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const { toast } = useToast();

  const fallbackSymbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA', 'BTC-USD', 'ETH-USD', 'SOL-USD', 'AVAX-USD', 'LINK-USD'];
  const symbols = trainedAssets.length > 0 ? trainedAssets : fallbackSymbols;
  const periods = [
    { value: '1week', label: '1 Week' },
    { value: '1month', label: '1 Month' },
    { value: '3months', label: '3 Months' },
    { value: '6months', label: '6 Months' },
    { value: '1year', label: '1 Year' },
    { value: '2years', label: '2 Years' }
  ];
  const riskLevels = [
    { value: 'low', label: 'Conservative (75%+ confluence)' },
    { value: 'medium', label: 'Moderate (45%+ confluence)' },
    { value: 'high', label: 'Aggressive (30%+ confluence)' }
  ];

  useEffect(() => {
    const fetchTrainedAssets = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoadingAssets(false);
          return;
        }
        
        const { data, error } = await supabase
          .from('asset_models')
          .select('symbol')
          .eq('user_id', user.id);
        
        if (!error && data) {
          const uniqueSymbols = [...new Set(data.map(row => row.symbol))].sort();
          setTrainedAssets(uniqueSymbols);
        }
      } catch (err) {
        console.error('Failed to fetch trained assets:', err);
      } finally {
        setIsLoadingAssets(false);
      }
    };
    
    fetchTrainedAssets();
  }, []);

  const selectAllTrained = () => {
    const assetsToSelect = trainedAssets.slice(0, 5);
    setSelectedSymbols(assetsToSelect);
    toast({
      title: "Selected Trained Assets",
      description: `Selected ${assetsToSelect.length} of ${trainedAssets.length} trained assets`,
    });
  };

  const clearSelection = () => {
    setSelectedSymbols([]);
    toast({
      title: "Selection Cleared",
      description: "All symbols have been deselected",
    });
  };

  const runBacktest = async () => {
    setIsRunning(true);
    setError(null);
    setResults(null);
    
    try {
      console.log('🔬 Starting batch backtest...', { symbols: selectedSymbols, selectedPeriod, selectedRisk });
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('You must be logged in to run backtests');
      }

      // Start batch backtest
      const { data, error: functionError } = await supabase.functions.invoke('batch-backtest', {
        body: {
          action: 'start',
          symbols: selectedSymbols,
          period: selectedPeriod,
          riskLevel: selectedRisk
        }
      });

      if (functionError) {
        console.error('Edge function error:', functionError);
        throw new Error(functionError.message || 'Failed to start backtest');
      }

      console.log('✅ Batch backtest started:', data);

      if (data && data.batchId) {
        setBatchId(data.batchId);
        setProgress({ completed: 0, total: data.totalJobs, percentage: 0 });
        
        toast({
          title: "Backtest Started",
          description: `Processing ${data.totalJobs} symbols. This may take a few minutes.`,
        });

        // Start polling for progress
        pollBacktestProgress(data.batchId);
      } else {
        throw new Error('Invalid backtest response format');
      }
    } catch (err: any) {
      console.error('Backtest error:', err);
      setError(err.message || 'Failed to run backtest');
      setIsRunning(false);
      toast({
        title: "Backtest Failed",
        description: err.message || 'Failed to run backtest. Please try again.',
        variant: "destructive"
      });
    }
  };

  const pollBacktestProgress = async (batchId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('batch-backtest', {
          body: {
            action: 'status',
            batchId
          }
        });

        if (error) {
          console.error('Status check error:', error);
          return;
        }

        if (data && data.progress) {
          setProgress({
            completed: data.progress.completed,
            total: data.progress.total,
            percentage: data.progress.percentage
          });

          console.log(`📊 Progress: ${data.progress.completed}/${data.progress.total} (${data.progress.percentage}%)`);

          // Check if complete
          if (data.backtestRun.status === 'completed' || 
              data.progress.completed + data.progress.failed >= data.progress.total) {
            clearInterval(pollInterval);
            setIsRunning(false);
            
            // Aggregate results from all jobs
            const allTrades: BacktestTrade[] = [];
            const symbolResults: any = {};
            
            data.jobs.forEach((job: any) => {
              if (job.results && job.results.trades) {
                job.results.trades.forEach((trade: any, index: number) => {
                  allTrades.push({
                    id: `${job.symbol}-${index}`,
                    date: trade.timestamp || new Date().toISOString().split('T')[0],
                    action: trade.action as 'BUY' | 'SELL',
                    price: trade.entryPrice || trade.price,
                    quantity: trade.quantity || 1,
                    confidence: trade.confidence || 0,
                    rsi: trade.indicators?.rsi || 0,
                    macd: trade.indicators?.macd?.histogram || 0,
                    volumeSpike: trade.indicators?.volumeSpike || false,
                    fibLevel: trade.indicators?.fibonacci || 0,
                    pnl: trade.pnl || 0,
                    closePrice: trade.exitPrice,
                    closeDate: trade.exitDate,
                    duration: trade.duration,
                    outcome: trade.outcome as 'win' | 'loss' | 'open'
                  });
                });
                symbolResults[job.symbol] = job.results;
              }
            });

            // Calculate aggregate metrics
            const winningTrades = allTrades.filter(t => t.outcome === 'win').length;
            const losingTrades = allTrades.filter(t => t.outcome === 'loss').length;
            const totalReturn = allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
            
            // Build equity curve from all trades
            let balance = 100000;
            const equityCurve = allTrades
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map(trade => {
                balance += trade.pnl || 0;
                return {
                  date: trade.date,
                  value: balance,
                  drawdown: Math.max(0, (100000 - balance) / 100000 * 100)
                };
              });

            const aggregatedResults: BacktestResults = {
              symbol: selectedSymbols.join(', '),
              period: selectedPeriod,
              totalTrades: allTrades.length,
              winningTrades,
              losingTrades,
              successRate: allTrades.length > 0 ? (winningTrades / allTrades.length) * 100 : 0,
              totalReturn: (totalReturn / 100000) * 100,
              maxDrawdown: Math.max(...equityCurve.map(e => e.drawdown)),
              sharpeRatio: 0, // Calculate from returns
              avgWin: winningTrades > 0 ? allTrades.filter(t => t.outcome === 'win').reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades : 0,
              avgLoss: losingTrades > 0 ? allTrades.filter(t => t.outcome === 'loss').reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades : 0,
              profitFactor: losingTrades > 0 ? 
                Math.abs(allTrades.filter(t => t.outcome === 'win').reduce((sum, t) => sum + (t.pnl || 0), 0) / 
                allTrades.filter(t => t.outcome === 'loss').reduce((sum, t) => sum + (t.pnl || 0), 0)) : 0,
              trades: allTrades,
              equityCurve
            };

            setResults(aggregatedResults);
            
            toast({
              title: "Backtest Complete",
              description: `Analyzed ${allTrades.length} trades across ${selectedSymbols.length} symbols with ${aggregatedResults.successRate.toFixed(1)}% win rate`,
            });
          }
        }
      } catch (err) {
        console.error('Error polling status:', err);
      }
    }, 3000); // Poll every 3 seconds
  };

  // Remove auto-run on mount - user should manually start backtests

  return (
    <div className="space-y-6">
      <Card className="bg-black/40 border-white/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Strategy Backtesting
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-300">
                  {trainedAssets.length > 0 ? `Trained Assets (${trainedAssets.length})` : 'Available Symbols'} - Select up to 5
                </label>
                {trainedAssets.length > 0 && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAllTrained}
                      disabled={isRunning || trainedAssets.length === 0}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearSelection}
                      disabled={isRunning || selectedSymbols.length === 0}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>
              {isLoadingAssets ? (
                <div className="text-sm text-gray-400 py-4">Loading your trained assets...</div>
              ) : trainedAssets.length === 0 ? (
                <Alert className="border-yellow-500/50 bg-yellow-500/10">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  <AlertDescription className="text-yellow-200">
                    No trained assets found. Train some models first to see them here, or use the fallback symbols below.
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {symbols.slice(0, 20).map(symbol => (
                  <Button
                    key={symbol}
                    variant={selectedSymbols.includes(symbol) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (selectedSymbols.includes(symbol)) {
                        setSelectedSymbols(selectedSymbols.filter(s => s !== symbol));
                      } else if (selectedSymbols.length < 5) {
                        setSelectedSymbols([...selectedSymbols, symbol]);
                      } else {
                        toast({
                          title: "Limit Reached",
                          description: "You can select up to 5 symbols at once",
                          variant: "destructive"
                        });
                      }
                    }}
                    disabled={isRunning}
                  >
                    {symbol}
                  </Button>
                ))}
              </div>
              <div className="text-xs text-gray-400">
                Selected: {selectedSymbols.join(', ') || 'None'}
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Period</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-40 bg-black/20 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periods.map(period => (
                    <SelectItem key={period.value} value={period.value}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-300">Risk Level</label>
              <Select value={selectedRisk} onValueChange={(v) => setSelectedRisk(v as 'low' | 'medium' | 'high')}>
                <SelectTrigger className="w-56 bg-black/20 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {riskLevels.map(level => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex flex-col gap-2 self-end">
              <Button 
                onClick={runBacktest} 
                disabled={isRunning || selectedSymbols.length === 0}
                className="w-full"
              >
                {isRunning ? (
                  <>
                    <Activity className="h-4 w-4 mr-2 animate-spin" />
                    Processing {progress.completed}/{progress.total}
                  </>
                ) : (
                  <>
                    <Target className="h-4 w-4 mr-2" />
                    Run Backtest ({selectedSymbols.length} symbols)
                  </>
                )}
              </Button>
              {isRunning && progress.total > 0 && (
                <div className="w-full">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{progress.percentage}% complete</span>
                    <span>{progress.completed}/{progress.total}</span>
                  </div>
                  <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {results && (
        <div className="space-y-6">
          {/* Performance Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-black/40 border-white/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-gray-300">Success Rate</span>
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {results.successRate}%
                </div>
                <Badge variant={results.successRate >= 60 ? "default" : "destructive"} className="mt-2">
                  {results.winningTrades}/{results.totalTrades} trades
                </Badge>
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-white/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-gray-300">Total Return</span>
                </div>
                <div className={`text-2xl font-bold mt-1 ${results.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {results.totalReturn >= 0 ? '+' : ''}{results.totalReturn}%
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  ${(results.totalReturn * 1000).toFixed(0)} on $100k
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-white/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-gray-300">Profit Factor</span>
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {results.profitFactor}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Gross Profit / Gross Loss
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-white/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-400" />
                  <span className="text-sm text-gray-300">Max Drawdown</span>
                </div>
                <div className="text-2xl font-bold text-red-400 mt-1">
                  -{results.maxDrawdown}%
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Worst losing streak
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <Tabs defaultValue="equity" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="equity">Equity Curve</TabsTrigger>
              <TabsTrigger value="drawdown">Drawdown</TabsTrigger>
              <TabsTrigger value="trades">Trade Analysis</TabsTrigger>
            </TabsList>

            <TabsContent value="equity">
              <Card className="bg-black/40 border-white/20">
                <CardHeader>
                  <CardTitle className="text-white">Portfolio Value Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={results.equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1F2937', 
                          border: '1px solid #374151',
                          color: 'white'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#10B981" 
                        strokeWidth={2}
                        dot={false}
                      />
                      <ReferenceLine y={100000} stroke="#6B7280" strokeDasharray="3 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="drawdown">
              <Card className="bg-black/40 border-white/20">
                <CardHeader>
                  <CardTitle className="text-white">Drawdown Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={results.equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1F2937', 
                          border: '1px solid #374151',
                          color: 'white'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="drawdown" 
                        stroke="#EF4444" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trades">
              <Card className="bg-black/40 border-white/20">
                <CardHeader>
                  <CardTitle className="text-white">Recent Trades</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {results.trades.slice(-10).reverse().map((trade, index) => (
                      <div key={trade.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/10">
                        <div className="flex items-center gap-3">
                          <Badge variant={trade.action === 'BUY' ? "default" : "destructive"}>
                            {trade.action}
                          </Badge>
                          <span className="text-white font-mono">
                            ${trade.price} x {trade.quantity}
                          </span>
                          <span className="text-xs text-gray-400">
                            RSI: {trade.rsi} | MACD: {trade.macd} | Conf: {trade.confidence}%
                          </span>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold ${trade.outcome === 'win' ? 'text-green-400' : 'text-red-400'}`}>
                            {trade.pnl >= 0 ? '+' : ''}${trade.pnl}
                          </div>
                          <div className="text-xs text-gray-400">
                            {trade.date}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Strategy Details */}
          <Card className="bg-black/40 border-white/20">
            <CardHeader>
              <CardTitle className="text-white">Strategy Performance Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-300">Average Win:</span>
                  <div className="text-green-400 font-bold">${results.avgWin}</div>
                </div>
                <div>
                  <span className="text-gray-300">Average Loss:</span>
                  <div className="text-red-400 font-bold">-${results.avgLoss}</div>
                </div>
                <div>
                  <span className="text-gray-300">Sharpe Ratio:</span>
                  <div className="text-white font-bold">{results.sharpeRatio}</div>
                </div>
                <div>
                  <span className="text-gray-300">Total Trades:</span>
                  <div className="text-white font-bold">{results.totalTrades}</div>
                </div>
              </div>
              
              <div className="bg-black/20 p-4 rounded-lg border border-white/10">
                <h4 className="text-white font-semibold mb-2">Strategy: RSI + MACD + Volume + Fibonacci</h4>
                <div className="text-gray-300 text-sm space-y-1">
                  <p>• <strong>Buy Signal:</strong> RSI &lt; 35, MACD &gt; 0.3, Volume spike, Fib level &lt; 0.4</p>
                  <p>• <strong>Sell Signal:</strong> RSI &gt; 65, MACD &lt; -0.3, Volume spike, Fib level &gt; 0.6</p>
                  <p>• <strong>Minimum Confidence:</strong> 70% (requires 2+ aligned signals)</p>
                  <p>• <strong>Position Size:</strong> $1000 per trade with dynamic quantity</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default BacktestAnalyzer;