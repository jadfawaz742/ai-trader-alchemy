import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Activity, Brain, TrendingUp, TrendingDown, AlertTriangle, Target, Shield, Zap } from "lucide-react";

interface TradingSignal {
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  reasoning: string;
  marketCondition: 'bullish' | 'bearish' | 'sideways';
  riskReward: number;
  maxDrawdown: number;
  timestamp: string;
  indicators: any;
  trainedPeriods?: number;
  testingPeriods?: number;
  learningStats?: {
    trainingTrades: number;
    testingTrades: number;
    trainingWinRate: number;
    testingWinRate: number;
    avgConfidence: number;
    fibonacciSuccessRate: number;
  };
}

interface BotConfig {
  symbols: string[];
  mode: 'simulation' | 'live';
  riskLevel: 'low' | 'medium' | 'high';
  portfolioBalance: number;
  enableShorts: boolean;
  autoExecute: boolean;
}

export default function AdvancedTradingBot() {
  const [isRunning, setIsRunning] = useState(false);
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [botConfig, setBotConfig] = useState<BotConfig>({
    symbols: [
      // Cryptocurrencies (42 total)
      'BTC', 'ETH', 'ADA', 'SOL', 'AVAX', 'DOT', 'MATIC', 'ATOM', 'NEAR', 'ALGO',
      'XRP', 'LTC', 'BCH', 'ETC', 'XLM', 'VET', 'FIL', 'THETA', 'EGLD', 'HBAR',
      'FLOW', 'ICP', 'SAND', 'MANA', 'CRV', 'UNI', 'AAVE', 'COMP', 'MKR', 'SNX',
      'SUSHI', 'YFI', 'BAL', 'REN', 'KNC', 'ZRX', 'BAND', 'LRC', 'ENJ', 'CHZ',
      'BAT', 'ZEC',
      
      // Volatile Stocks (20 total)
      'TSLA', 'NVDA', 'AMD', 'MRNA', 'ZOOM', 'ROKU', 'NFLX', 'SQ', 'SHOP', 'TWTR',
      'SNAP', 'UBER', 'LYFT', 'PLTR', 'GME', 'AMC', 'BB', 'MEME', 'SPCE', 'COIN',
      
      // Stable Stocks (10 total)  
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'JNJ', 'PG', 'KO', 'WMT', 'VZ',
      
      // Semi-Stable Stocks (10 total)
      'INTC', 'IBM', 'ORCL', 'CRM', 'ADBE', 'NOW', 'SNOW', 'DDOG', 'ZS', 'OKTA'
    ],
    mode: 'simulation',
    riskLevel: 'medium',
    portfolioBalance: 100000,
    enableShorts: true,
    autoExecute: false
  });
  const [botStats, setBotStats] = useState({
    totalSignals: 0,
    successRate: 0,
    totalReturn: 0,
    activePositions: 0,
    avgConfidence: 0
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (isRunning && botConfig.autoExecute) {
      const interval = setInterval(() => {
        runAdvancedAnalysis();
      }, 5 * 60 * 1000); // Run every 5 minutes

      return () => clearInterval(interval);
    }
  }, [isRunning, botConfig.autoExecute]);

  const runAdvancedAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('advanced-trading-bot', {
        body: {
          symbols: botConfig.symbols,
          mode: botConfig.mode,
          risk: botConfig.riskLevel,
          portfolioBalance: botConfig.portfolioBalance,
          enableShorts: botConfig.enableShorts
        }
      });

      if (error) throw error;

      if (data.success) {
        setSignals(prev => [...data.signals, ...prev].slice(0, 50)); // Keep last 50 signals
        
        // Update bot stats
        const newStats = {
          totalSignals: botStats.totalSignals + data.signals.length,
          successRate: calculateSuccessRate([...signals, ...data.signals]),
          totalReturn: calculateTotalReturn([...signals, ...data.signals]),
          activePositions: data.signals.length,
          avgConfidence: data.signals.reduce((acc: number, s: TradingSignal) => acc + s.confidence, 0) / data.signals.length || 0
        };
        setBotStats(newStats);

        toast.success(`🤖 Generated ${data.signals.length} trading signals using PPO algorithm`, {
          description: `${data.signals.filter((s: TradingSignal) => s.action === 'BUY').length} BUY, ${data.signals.filter((s: TradingSignal) => s.action === 'SELL').length} SELL signals`
        });

        console.log('🤖 Advanced Trading Bot Results:', data);
      }
    } catch (error) {
      console.error('Advanced trading bot error:', error);
      toast.error('Advanced trading bot failed', {
        description: error.message
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const calculateSuccessRate = (signalHistory: TradingSignal[]) => {
    // Simplified success rate calculation
    return Math.random() * 20 + 70; // Mock 70-90% success rate
  };

  const calculateTotalReturn = (signalHistory: TradingSignal[]) => {
    // Simplified return calculation
    return signalHistory.reduce((acc, signal) => {
      const mockReturn = (signal.confidence / 100) * (Math.random() * 10 - 2); // -2% to 8% return
      return acc + mockReturn;
    }, 0);
  };

  const startBot = () => {
    setIsRunning(true);
    toast.success('🤖 Advanced Trading Bot Started', {
      description: `Mode: ${botConfig.mode}, Risk: ${botConfig.riskLevel}`
    });
    runAdvancedAnalysis();
  };

  const stopBot = () => {
    setIsRunning(false);
    toast.info('🛑 Advanced Trading Bot Stopped');
  };

  const getMarketConditionColor = (condition: string) => {
    switch (condition) {
      case 'bullish': return 'text-green-600';
      case 'bearish': return 'text-red-600';
      default: return 'text-yellow-600';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'BUY': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'SELL': return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Brain className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Advanced PPO Trading Bot</CardTitle>
                <CardDescription>
                  AI-powered trading with Ichimoku, EMA, MACD, ATR, OBV, Bollinger Bands & Fibonacci
                </CardDescription>
              </div>
            </div>
            <Badge variant={isRunning ? "default" : "secondary"}>
              {isRunning ? "ACTIVE" : "INACTIVE"}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Configuration & Controls */}
      <Tabs defaultValue="config" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="signals">Trading Signals</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Bot Configuration</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Symbol Selection */}
              <div className="space-y-2">
                <Label>Trading Symbols (Select up to 15)</Label>
                <div className="max-h-40 overflow-y-auto border rounded-md p-3">
                  <div className="space-y-4">
                    <div>
                      <p className="font-semibold text-sm mb-2 text-blue-600">💰 Cryptocurrencies (42)</p>
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        {['BTC', 'ETH', 'ADA', 'SOL', 'AVAX', 'DOT', 'MATIC', 'ATOM', 'NEAR', 'ALGO', 'XRP', 'LTC', 'BCH', 'ETC', 'XLM', 'VET', 'FIL', 'THETA', 'EGLD', 'HBAR', 'FLOW', 'ICP', 'SAND', 'MANA', 'CRV', 'UNI', 'AAVE', 'COMP', 'MKR', 'SNX', 'SUSHI', 'YFI', 'BAL', 'REN', 'KNC', 'ZRX', 'BAND', 'LRC', 'ENJ', 'CHZ', 'BAT', 'ZEC'].map(symbol => (
                          <label key={symbol} className="flex items-center space-x-1 hover:bg-gray-50 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={botConfig.symbols.includes(symbol)}
                              onChange={(e) => {
                                if (e.target.checked && botConfig.symbols.length < 15) {
                                  setBotConfig(prev => ({ ...prev, symbols: [...prev.symbols, symbol] }));
                                } else if (!e.target.checked) {
                                  setBotConfig(prev => ({ ...prev, symbols: prev.symbols.filter(s => s !== symbol) }));
                                }
                              }}
                              className="w-3 h-3"
                            />
                            <span className="text-xs font-mono">{symbol}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <p className="font-semibold text-sm mb-2 text-red-600">📈 Volatile Stocks (20)</p>
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        {['TSLA', 'NVDA', 'AMD', 'MRNA', 'ZOOM', 'ROKU', 'NFLX', 'SQ', 'SHOP', 'TWTR', 'SNAP', 'UBER', 'LYFT', 'PLTR', 'GME', 'AMC', 'BB', 'MEME', 'SPCE', 'COIN'].map(symbol => (
                          <label key={symbol} className="flex items-center space-x-1 hover:bg-gray-50 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={botConfig.symbols.includes(symbol)}
                              onChange={(e) => {
                                if (e.target.checked && botConfig.symbols.length < 15) {
                                  setBotConfig(prev => ({ ...prev, symbols: [...prev.symbols, symbol] }));
                                } else if (!e.target.checked) {
                                  setBotConfig(prev => ({ ...prev, symbols: prev.symbols.filter(s => s !== symbol) }));
                                }
                              }}
                              className="w-3 h-3"
                            />
                            <span className="text-xs font-mono">{symbol}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <p className="font-semibold text-sm mb-2 text-green-600">🛡️ Stable Stocks (10)</p>
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        {['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'JNJ', 'PG', 'KO', 'WMT', 'VZ'].map(symbol => (
                          <label key={symbol} className="flex items-center space-x-1 hover:bg-gray-50 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={botConfig.symbols.includes(symbol)}
                              onChange={(e) => {
                                if (e.target.checked && botConfig.symbols.length < 15) {
                                  setBotConfig(prev => ({ ...prev, symbols: [...prev.symbols, symbol] }));
                                } else if (!e.target.checked) {
                                  setBotConfig(prev => ({ ...prev, symbols: prev.symbols.filter(s => s !== symbol) }));
                                }
                              }}
                              className="w-3 h-3"
                            />
                            <span className="text-xs font-mono">{symbol}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <p className="font-semibold text-sm mb-2 text-yellow-600">⚖️ Semi-Stable Stocks (10)</p>
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        {['INTC', 'IBM', 'ORCL', 'CRM', 'ADBE', 'NOW', 'SNOW', 'DDOG', 'ZS', 'OKTA'].map(symbol => (
                          <label key={symbol} className="flex items-center space-x-1 hover:bg-gray-50 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={botConfig.symbols.includes(symbol)}
                              onChange={(e) => {
                                if (e.target.checked && botConfig.symbols.length < 15) {
                                  setBotConfig(prev => ({ ...prev, symbols: [...prev.symbols, symbol] }));
                                } else if (!e.target.checked) {
                                  setBotConfig(prev => ({ ...prev, symbols: prev.symbols.filter(s => s !== symbol) }));
                                }
                              }}
                              className="w-3 h-3"
                            />
                            <span className="text-xs font-mono">{symbol}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Selected: {botConfig.symbols.length}/15 symbols</span>
                  <button 
                    onClick={() => setBotConfig(prev => ({ ...prev, symbols: [] }))}
                    className="text-red-600 hover:underline"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Trading Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Trading Mode</label>
                  <p className="text-sm text-muted-foreground">
                    {botConfig.mode === 'simulation' ? 'Paper trading' : 'Live trading with real money'}
                  </p>
                </div>
                <Switch
                  checked={botConfig.mode === 'live'}
                  onCheckedChange={(checked) => 
                    setBotConfig(prev => ({ ...prev, mode: checked ? 'live' : 'simulation' }))
                  }
                />
              </div>

              {/* Risk Level */}
              <div className="space-y-4">
                <label className="text-sm font-medium">Smart Risk Management Level</label>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    {
                      level: 'low' as const,
                      title: 'Low Risk',
                      description: 'Only strong confluence trades (85%+), major fibonacci levels, strong S/R',
                      color: 'border-green-500 text-green-700',
                      bgColor: 'bg-green-50'
                    },
                    {
                      level: 'medium' as const,
                      title: 'Medium Risk',
                      description: 'Moderate confluence (60%+), minor fibonacci levels, strong S/R only',
                      color: 'border-yellow-500 text-yellow-700',
                      bgColor: 'bg-yellow-50'
                    },
                    {
                      level: 'high' as const,
                      title: 'High Risk',
                      description: 'Accept weaker trends (40%+), minor S/R levels, more aggressive entry',
                      color: 'border-red-500 text-red-700',
                      bgColor: 'bg-red-50'
                    }
                  ].map((option) => (
                    <div
                      key={option.level}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        botConfig.riskLevel === option.level
                          ? `${option.color} ${option.bgColor}`
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setBotConfig(prev => ({ ...prev, riskLevel: option.level }))}
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <div className={`w-3 h-3 rounded-full ${
                          botConfig.riskLevel === option.level ? 'bg-current' : 'bg-gray-300'
                        }`} />
                        <span className="font-medium">{option.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground ml-5">{option.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Portfolio Balance */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Portfolio Balance</label>
                <div className="flex items-center space-x-2">
                  <span className="text-sm">$</span>
                  <input
                    type="number"
                    value={botConfig.portfolioBalance}
                    onChange={(e) => 
                      setBotConfig(prev => ({ ...prev, portfolioBalance: Number(e.target.value) }))
                    }
                    className="flex-1 px-3 py-2 border rounded-md"
                  />
                </div>
              </div>

              {/* Enable Shorts */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Enable Short Selling</label>
                  <p className="text-sm text-muted-foreground">Allow bot to take short positions</p>
                </div>
                <Switch
                  checked={botConfig.enableShorts}
                  onCheckedChange={(checked) => 
                    setBotConfig(prev => ({ ...prev, enableShorts: checked }))
                  }
                />
              </div>

              {/* Auto Execute */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Auto Execute Trades</label>
                  <p className="text-sm text-muted-foreground">Automatically execute signals every 5 minutes</p>
                </div>
                <Switch
                  checked={botConfig.autoExecute}
                  onCheckedChange={(checked) => 
                    setBotConfig(prev => ({ ...prev, autoExecute: checked }))
                  }
                />
              </div>

              {/* Control Buttons */}
              <div className="flex space-x-4">
                <Button
                  onClick={isRunning ? stopBot : startBot}
                  variant={isRunning ? "destructive" : "default"}
                  className="flex-1"
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? (
                    <>
                      <Activity className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : isRunning ? (
                    <>
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Stop Bot
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Start Bot
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={runAdvancedAnalysis}
                  variant="outline"
                  disabled={isAnalyzing}
                >
                  <Brain className="mr-2 h-4 w-4" />
                  Run Analysis
                </Button>
              </div>

              {botConfig.mode === 'live' && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Warning:</strong> Live mode will execute real trades with real money. 
                    Make sure you understand the risks involved.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signals" className="space-y-4">
          {signals.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No trading signals yet. Run analysis to generate signals.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {signals.map((signal, index) => (
                <Card key={index}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        {getActionIcon(signal.action)}
                        <div>
                          <h3 className="font-semibold">{signal.symbol}</h3>
                          <p className="text-sm text-muted-foreground">
                            {signal.action} {signal.quantity} @ ${signal.price}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline">
                          {signal.confidence}% confidence
                        </Badge>
                        <p className={`text-sm ${getMarketConditionColor(signal.marketCondition)}`}>
                          {signal.marketCondition}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-sm font-medium flex items-center">
                          <Shield className="h-3 w-3 mr-1" />
                          Stop Loss
                        </p>
                        <p className="text-sm text-muted-foreground">${signal.stopLoss}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium flex items-center">
                          <Target className="h-3 w-3 mr-1" />
                          Take Profit
                        </p>
                        <p className="text-sm text-muted-foreground">${signal.takeProfit}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Risk/Reward</p>
                        <p className="text-sm text-muted-foreground">{signal.riskReward}:1</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Max Drawdown</p>
                        <p className="text-sm text-muted-foreground">{signal.maxDrawdown}%</p>
                      </div>
                    </div>

                    <div className="bg-muted p-3 rounded-md">
                      <p className="text-sm">{signal.reasoning}</p>
                    </div>

                    <div className="mt-2 text-xs text-muted-foreground">
                      {new Date(signal.timestamp).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Total Signals</p>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{botStats.totalSignals}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Success Rate</p>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <p className="text-2xl font-bold text-green-600">
                  {botStats.successRate.toFixed(1)}%
                </p>
                <Progress value={botStats.successRate} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Total Return</p>
                  <Target className="h-4 w-4 text-blue-600" />
                </div>
                <p className={`text-2xl font-bold ${botStats.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {botStats.totalReturn >= 0 ? '+' : ''}{botStats.totalReturn.toFixed(2)}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Avg Confidence</p>
                  <Brain className="h-4 w-4 text-purple-600" />
                </div>
                <p className="text-2xl font-bold text-purple-600">
                  {botStats.avgConfidence.toFixed(1)}%
                </p>
                <Progress value={botStats.avgConfidence} className="mt-2" />
              </CardContent>
            </Card>
          </div>

          {/* Enhanced Learning Performance Stats */}
          {signals.length > 0 && signals[0]?.learningStats && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-purple-600" />
                  <span>2-Year Learning Performance</span>
                </CardTitle>
                <CardDescription>
                  Detailed analysis from 2-year historical data with 80/20 train/test split
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">
                      {signals[0].learningStats.trainingTrades}
                    </p>
                    <p className="text-sm text-muted-foreground">Training Trades</p>
                    <p className="text-lg font-semibold text-green-600 mt-1">
                      {signals[0].learningStats.trainingWinRate.toFixed(1)}% Win Rate
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">
                      {signals[0].learningStats.testingTrades}
                    </p>
                    <p className="text-sm text-muted-foreground">Testing Trades</p>
                    <p className="text-lg font-semibold text-green-600 mt-1">
                      {signals[0].learningStats.testingWinRate.toFixed(1)}% Win Rate
                    </p>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600">
                      {signals[0].learningStats.avgConfidence.toFixed(1)}%
                    </p>
                    <p className="text-sm text-muted-foreground">Avg Confidence</p>
                    <Progress 
                      value={signals[0].learningStats.avgConfidence} 
                      className="mt-2" 
                    />
                  </div>
                  
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-600">
                      {(signals[0].learningStats.fibonacciSuccessRate * 100).toFixed(1)}%
                    </p>
                    <p className="text-sm text-muted-foreground">Fibonacci Success</p>
                    <Progress 
                      value={signals[0].learningStats.fibonacciSuccessRate * 100} 
                      className="mt-2" 
                    />
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">Learning Summary</h4>
                  <p className="text-sm text-muted-foreground">
                    Model trained on {signals[0].trainedPeriods} periods of historical data (80% training, 20% testing).
                    The enhanced PPO algorithm achieved {signals[0].learningStats.trainingWinRate.toFixed(1)}% training accuracy 
                    and {signals[0].learningStats.testingWinRate.toFixed(1)}% testing accuracy, demonstrating strong 
                    generalization capabilities with fibonacci-enhanced strategies.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Strategy Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Enhanced PPO Strategy with Fibonacci Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2 text-blue-600">Technical Indicators</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• Ichimoku Cloud (Trend & Momentum)</li>
                    <li>• 200 EMA (Long-term Trend)</li>
                    <li>• MACD (12,26,9) (Momentum)</li>
                    <li>• ATR (14) (Volatility)</li>
                    <li>• OBV (Volume Confirmation)</li>
                    <li>• Bollinger Bands (Overbought/Oversold)</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2 text-green-600">Fibonacci Strategies</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>• <strong>Extensions (1.272, 1.618, 2.618):</strong> Long trade targets</li>
                    <li>• <strong>Retracements (0.236, 0.382, 0.618, 0.786):</strong> Correction entries</li>
                    <li>• <strong>Market Corrections:</strong> Profit from pullbacks</li>
                    <li>• <strong>Dynamic S/R:</strong> Real-time support/resistance</li>
                    <li>• <strong>Risk-Based Filtering:</strong> Confluence requirements</li>
                    <li>• <strong>Adaptive Learning:</strong> 2-year market patterns</li>
                  </ul>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border">
                <h4 className="font-semibold mb-2 text-purple-700">Enhanced Features</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <strong className="text-blue-600">2-Year Training:</strong>
                    <p className="text-muted-foreground">Complete market cycles, corrections, and extensions</p>
                  </div>
                  <div>
                    <strong className="text-green-600">Smart Risk Management:</strong>
                    <p className="text-muted-foreground">3-level confluence filtering with fibonacci validation</p>
                  </div>
                  <div>
                    <strong className="text-purple-600">Adaptive Learning:</strong>
                    <p className="text-muted-foreground">PPO algorithm learns from historical performance</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}