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
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [selectedPeriod, setSelectedPeriod] = useState('3months');
  const [selectedRisk, setSelectedRisk] = useState<'low' | 'medium' | 'high'>('medium');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<BacktestResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA', 'BTC-USD', 'ETH-USD', 'SOL-USD', 'AVAX-USD', 'LINK-USD'];
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

  const runBacktest = async () => {
    setIsRunning(true);
    setError(null);
    
    try {
      console.log('🔬 Starting real backtest...', { selectedSymbol, selectedPeriod, selectedRisk });
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('You must be logged in to run backtests');
      }

      // Call the real edge function
      const { data, error: functionError } = await supabase.functions.invoke('advanced-trading-bot', {
        body: {
          mode: 'scan',
          symbols: [selectedSymbol],
          risk: selectedRisk,
          portfolioBalance: 100000,
          tradingFrequency: 'aggressive',
          maxDailyTrades: 20,
          enableShorts: false,
          backtestMode: true,
          backtestPeriod: selectedPeriod
        }
      });

      if (functionError) {
        console.error('Edge function error:', functionError);
        throw new Error(functionError.message || 'Failed to run backtest');
      }

      console.log('✅ Backtest results received:', data);

      // Check for data quality warnings
      if (data && data.tradeDecisionLogs) {
        const dataPoints = data.tradeDecisionLogs.length;
        if (dataPoints < 50) {
          toast({
            title: "Limited Data Warning",
            description: `Only ${dataPoints} data points available. Consider using a longer period for better results.`,
            variant: "destructive"
          });
        }
      }

      // Transform the API response to our BacktestResults interface
      if (data && data.backtestResults) {
        const apiResults = data.backtestResults;
        
        // Map trades to our interface
        const trades: BacktestTrade[] = apiResults.trades?.map((trade: any, index: number) => ({
          id: `trade-${index}`,
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
        })) || [];

        // Map equity curve
        const equityCurve = apiResults.equityCurve?.map((point: any) => ({
          date: point.date || point.timestamp,
          value: point.value || point.balance,
          drawdown: point.drawdown || 0
        })) || [];

        const transformedResults: BacktestResults = {
          symbol: selectedSymbol,
          period: selectedPeriod,
          totalTrades: apiResults.totalTrades || trades.length,
          winningTrades: apiResults.winningTrades || trades.filter(t => t.outcome === 'win').length,
          losingTrades: apiResults.losingTrades || trades.filter(t => t.outcome === 'loss').length,
          successRate: apiResults.winRate || 0,
          totalReturn: apiResults.roi || 0,
          maxDrawdown: apiResults.maxDrawdown || 0,
          sharpeRatio: apiResults.sharpeRatio || 0,
          avgWin: apiResults.avgWin || 0,
          avgLoss: apiResults.avgLoss || 0,
          profitFactor: apiResults.profitFactor || 0,
          trades,
          equityCurve
        };

        setResults(transformedResults);
        
        toast({
          title: "Backtest Complete",
          description: `Analyzed ${transformedResults.totalTrades} trades with ${transformedResults.successRate.toFixed(1)}% win rate`,
        });
      } else {
        throw new Error('Invalid backtest response format');
      }
    } catch (err: any) {
      console.error('Backtest error:', err);
      setError(err.message || 'Failed to run backtest');
      toast({
        title: "Backtest Failed",
        description: err.message || 'Failed to run backtest. Please try again.',
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    // Auto-run on mount only
    runBacktest();
  }, []);

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
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Symbol</label>
              <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                <SelectTrigger className="w-40 bg-black/20 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {symbols.map(symbol => (
                    <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            
            <Button 
              onClick={runBacktest} 
              disabled={isRunning}
              className="self-end"
            >
              {isRunning ? (
                <>
                  <Activity className="h-4 w-4 mr-2 animate-spin" />
                  Running Backtest...
                </>
              ) : (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  Run Backtest
                </>
              )}
            </Button>
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