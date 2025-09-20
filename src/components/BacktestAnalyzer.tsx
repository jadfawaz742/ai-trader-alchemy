import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Target, Timer, DollarSign, BarChart3, Activity } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const [selectedPeriod, setSelectedPeriod] = useState('6m');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<BacktestResults | null>(null);

  const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA'];
  const periods = [
    { value: '3m', label: '3 Months' },
    { value: '6m', label: '6 Months' },
    { value: '1y', label: '1 Year' },
    { value: '2y', label: '2 Years' }
  ];

  const runBacktest = async () => {
    setIsRunning(true);
    
    // Simulate backtesting delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const mockResults = generateMockBacktestResults(selectedSymbol, selectedPeriod);
    setResults(mockResults);
    setIsRunning(false);
  };

  const generateMockBacktestResults = (symbol: string, period: string): BacktestResults => {
    const days = period === '3m' ? 90 : period === '6m' ? 180 : period === '1y' ? 365 : 730;
    const trades: BacktestTrade[] = [];
    const equityCurve: Array<{ date: string; value: number; drawdown: number }> = [];
    
    let startingValue = 100000;
    let currentValue = startingValue;
    let maxValue = startingValue;
    let basePrice = 150; // Starting price for AAPL
    
    // Generate historical data and trades
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - i));
      
      // Price movement simulation
      const dailyChange = (Math.random() - 0.5) * 0.06; // ±3% daily
      basePrice *= (1 + dailyChange);
      
      // Generate mock technical indicators
      const rsi = 30 + Math.random() * 40; // 30-70 range
      const macd = (Math.random() - 0.5) * 2; // -1 to 1
      const volumeSpike = Math.random() > 0.8; // 20% chance
      const fibLevel = Math.random();
      
      // Strategy logic (simplified version of our auto-trade function)
      const rsiSignal = rsi < 35 ? 'BUY' : rsi > 65 ? 'SELL' : 'HOLD';
      const macdSignal = macd > 0.3 ? 'BUY' : macd < -0.3 ? 'SELL' : 'HOLD';
      const fibSignal = fibLevel < 0.4 ? 'BUY' : fibLevel > 0.6 ? 'SELL' : 'HOLD';
      
      const signals = [rsiSignal, macdSignal, fibSignal];
      const buySignals = signals.filter(s => s === 'BUY').length;
      const sellSignals = signals.filter(s => s === 'SELL').length;
      
      let action: 'BUY' | 'SELL' | null = null;
      let confidence = 50;
      
      if (buySignals >= 2 && Math.random() > 0.85) { // 15% chance to trade
        action = 'BUY';
        confidence = 70 + (buySignals * 10) + (volumeSpike ? 10 : 0);
      } else if (sellSignals >= 2 && Math.random() > 0.85) {
        action = 'SELL';
        confidence = 70 + (sellSignals * 10) + (volumeSpike ? 10 : 0);
      }
      
      if (action && confidence >= 70) {
        const quantity = Math.floor(1000 / basePrice);
        const trade: BacktestTrade = {
          id: `trade-${i}`,
          date: date.toISOString().split('T')[0],
          action,
          price: Math.round(basePrice * 100) / 100,
          quantity,
          confidence: Math.round(confidence),
          rsi: Math.round(rsi * 10) / 10,
          macd: Math.round(macd * 1000) / 1000,
          volumeSpike,
          fibLevel: Math.round(fibLevel * 100) / 100,
          outcome: 'open'
        };
        
        // Simulate trade outcomes
        const holdDays = 3 + Math.floor(Math.random() * 10); // 3-12 days
        const futurePrice = basePrice * (1 + (Math.random() - 0.45) * 0.15); // ±7.5% with slight positive bias
        
        const pnl = action === 'BUY' 
          ? (futurePrice - basePrice) * quantity
          : (basePrice - futurePrice) * quantity;
        
        trade.pnl = Math.round(pnl * 100) / 100;
        trade.closePrice = Math.round(futurePrice * 100) / 100;
        trade.duration = holdDays;
        trade.outcome = pnl > 0 ? 'win' : 'loss';
        
        trades.push(trade);
        currentValue += pnl;
      }
      
      // Update max value and calculate drawdown
      if (currentValue > maxValue) maxValue = currentValue;
      const drawdown = ((maxValue - currentValue) / maxValue) * 100;
      
      // Add to equity curve (sample every 7 days for chart)
      if (i % 7 === 0) {
        equityCurve.push({
          date: date.toISOString().split('T')[0],
          value: Math.round(currentValue),
          drawdown: Math.round(drawdown * 100) / 100
        });
      }
    }
    
    // Calculate results
    const winningTrades = trades.filter(t => t.outcome === 'win').length;
    const losingTrades = trades.filter(t => t.outcome === 'loss').length;
    const successRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
    const totalReturn = ((currentValue - startingValue) / startingValue) * 100;
    
    const wins = trades.filter(t => t.outcome === 'win');
    const losses = trades.filter(t => t.outcome === 'loss');
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + (t.pnl || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0) / losses.length) : 0;
    
    const grossProfit = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;
    
    const maxDrawdown = Math.max(...equityCurve.map(e => e.drawdown));
    const sharpeRatio = totalReturn > 0 ? totalReturn / Math.max(maxDrawdown, 1) : 0;
    
    return {
      symbol,
      period,
      totalTrades: trades.length,
      winningTrades,
      losingTrades,
      successRate: Math.round(successRate * 100) / 100,
      totalReturn: Math.round(totalReturn * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      trades,
      equityCurve
    };
  };

  useEffect(() => {
    runBacktest();
  }, [selectedSymbol, selectedPeriod]);

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
          <div className="flex gap-4">
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Symbol</label>
              <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                <SelectTrigger className="w-32 bg-black/20 border-white/20 text-white">
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
                <SelectTrigger className="w-32 bg-black/20 border-white/20 text-white">
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
            
            <Button 
              onClick={runBacktest} 
              disabled={isRunning}
              className="self-end"
            >
              {isRunning ? (
                <>
                  <Activity className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  Run Backtest
                </>
              )}
            </Button>
          </div>
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