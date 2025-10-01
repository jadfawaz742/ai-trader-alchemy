import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, Target, Shield, Activity, Brain } from 'lucide-react';

interface TradeDecisionLog {
  symbol: string;
  timestamp: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  price: number;
  exitPrice?: number;
  quantity: number;
  confidence: number;
  stopLoss?: number;
  takeProfit?: number;
  indicators: {
    rsi?: number;
    macd?: number;
    macdLine?: number;
    macdSignal?: number;
    ema?: number;
    ema200?: number;
    atr?: number;
    sentiment?: number;
    obv?: number;
    bollingerUpper?: number;
    bollingerMiddle?: number;
    bollingerLower?: number;
    bollingerPosition?: number;
    ichimokuTenkan?: number;
    ichimokuKijun?: number;
    ichimokuSignal?: number;
    marketCondition?: string;
    volatility?: number;
    confluenceScore?: number;
    multiTimeframe?: {
      trend: string;
      strength: number;
      confluence: number;
      boost: number;
    };
  };
  decisionReasoning: string;
  pnl?: number;
  result?: 'WIN' | 'LOSS';
}

interface TradeDecisionLogsProps {
  logs: TradeDecisionLog[];
  title?: string;
}

export const TradeDecisionLogs: React.FC<TradeDecisionLogsProps> = ({ 
  logs, 
  title = "Last 20 Trade Decisions" 
}) => {
  if (!logs || logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>No trade decision logs available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Calculate performance metrics
  const calculatePerformanceMetrics = () => {
    const completedTrades = logs.filter(log => log.pnl !== undefined && log.result);
    const totalPnL = completedTrades.reduce((sum, log) => sum + (log.pnl || 0), 0);
    const winningTrades = completedTrades.filter(log => log.result === 'WIN').length;
    const winRate = completedTrades.length > 0 ? (winningTrades / completedTrades.length) * 100 : 0;
    
    // Calculate total capital deployed
    const totalCapitalUsed = logs.reduce((sum, log) => sum + (log.price * log.quantity), 0);
    const dailyROI = totalCapitalUsed > 0 ? (totalPnL / totalCapitalUsed) * 100 : 0;
    
    // Group by asset
    const assetBreakdown = logs.reduce((acc, log) => {
      if (!acc[log.symbol]) {
        acc[log.symbol] = { capital: 0, pnl: 0, trades: 0 };
      }
      acc[log.symbol].capital += log.price * log.quantity;
      acc[log.symbol].pnl += log.pnl || 0;
      acc[log.symbol].trades += 1;
      return acc;
    }, {} as Record<string, { capital: number; pnl: number; trades: number }>);

    return { totalPnL, winRate, completedTrades: completedTrades.length, dailyROI, totalCapitalUsed, assetBreakdown };
  };

  const metrics = calculatePerformanceMetrics();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'BUY': return 'bg-green-500/10 text-green-700 dark:text-green-300';
      case 'SELL': return 'bg-red-500/10 text-red-700 dark:text-red-300';
      default: return 'bg-gray-500/10 text-gray-700 dark:text-gray-300';
    }
  };

  const getResultColor = (result: string) => {
    return result === 'WIN' 
      ? 'bg-green-500/10 text-green-700 dark:text-green-300'
      : 'bg-red-500/10 text-red-700 dark:text-red-300';
  };

  const getIndicatorIcon = (value: number, type: 'rsi' | 'macd' | 'sentiment') => {
    if (type === 'rsi') {
      if (value > 70) return <TrendingDown className="h-3 w-3 text-red-500" />;
      if (value < 30) return <TrendingUp className="h-3 w-3 text-green-500" />;
      return <Activity className="h-3 w-3 text-yellow-500" />;
    }
    if (type === 'macd') {
      return value > 0 
        ? <TrendingUp className="h-3 w-3 text-green-500" />
        : <TrendingDown className="h-3 w-3 text-red-500" />;
    }
    if (type === 'sentiment') {
      if (value > 0.3) return <TrendingUp className="h-3 w-3 text-green-500" />;
      if (value < -0.3) return <TrendingDown className="h-3 w-3 text-red-500" />;
      return <Activity className="h-3 w-3 text-yellow-500" />;
    }
    return null;
  };

  const explainRiskManagement = (log: TradeDecisionLog) => {
    if (!log.stopLoss && !log.takeProfit) return null;
    
    const stopLossPercent = log.stopLoss ? Math.abs(((log.stopLoss - log.price) / log.price) * 100) : 0;
    const takeProfitPercent = log.takeProfit ? Math.abs(((log.takeProfit - log.price) / log.price) * 100) : 0;
    const riskReward = takeProfitPercent > 0 && stopLossPercent > 0 ? (takeProfitPercent / stopLossPercent).toFixed(2) : 'N/A';
    
    return (
      <div className="text-xs text-muted-foreground space-y-1 mt-2">
        {log.stopLoss && (
          <div>• Stop Loss set {stopLossPercent.toFixed(2)}% from entry {log.indicators.atr ? `(~${(stopLossPercent / (log.indicators.atr / log.price * 100)).toFixed(1)}x ATR)` : ''}</div>
        )}
        {log.takeProfit && (
          <div>• Take Profit set {takeProfitPercent.toFixed(2)}% from entry (Risk:Reward = 1:{riskReward})</div>
        )}
        {log.confidence && (
          <div>• Levels adjusted for {log.confidence.toFixed(0)}% confidence score</div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>
          Detailed analysis of trading decisions with indicators and reasoning
        </CardDescription>
        
        {/* Performance Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
          <div>
            <div className="text-sm text-muted-foreground">Daily ROI</div>
            <div className={`text-2xl font-bold ${metrics.dailyROI >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.dailyROI.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Total P&L</div>
            <div className={`text-2xl font-bold ${metrics.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(metrics.totalPnL)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Win Rate</div>
            <div className="text-2xl font-bold">{metrics.winRate.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">{metrics.completedTrades} completed</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Capital Used</div>
            <div className="text-2xl font-bold">{formatCurrency(metrics.totalCapitalUsed)}</div>
          </div>
        </div>

        {/* Asset Breakdown */}
        {Object.keys(metrics.assetBreakdown).length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-sm font-medium mb-2">Capital by Asset</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(metrics.assetBreakdown).map(([symbol, data]) => (
                <div key={symbol} className="bg-muted/50 p-2 rounded">
                  <div className="font-mono text-sm font-medium">{symbol}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(data.capital)} • {data.trades} trades
                  </div>
                  <div className={`text-xs font-medium ${data.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(data.pnl)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-4">
            {logs.map((log, index) => (
              <div key={index} className="border rounded-lg p-4 bg-card/50">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      {log.symbol}
                    </Badge>
                    <Badge className={getActionColor(log.action)}>
                      {log.action}
                    </Badge>
                    {log.result && (
                      <Badge className={getResultColor(log.result)}>
                        {log.result}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                {/* Trade Details */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Entry Price</div>
                    <div className="font-medium">{formatCurrency(log.price)}</div>
                  </div>
                  {log.exitPrice && (
                    <div>
                      <div className="text-sm text-muted-foreground">Exit Price</div>
                      <div className="font-medium">{formatCurrency(log.exitPrice)}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm text-muted-foreground">Quantity</div>
                    <div className="font-medium">{log.quantity}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Position Size</div>
                    <div className="font-bold text-blue-600">{formatCurrency(log.price * log.quantity)}</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(log.price)} × {log.quantity}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Confidence</div>
                    <div className="font-medium">{log.confidence.toFixed(1)}%</div>
                  </div>
                  {log.pnl !== undefined && (
                    <div>
                      <div className="text-sm text-muted-foreground">P&L</div>
                      <div className={`font-medium ${log.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(log.pnl)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {((log.pnl / (log.price * log.quantity)) * 100).toFixed(2)}% ROI
                      </div>
                    </div>
                  )}
                </div>

                {/* Risk Management */}
                {(log.stopLoss || log.takeProfit) && (
                  <div className="bg-muted/30 p-3 rounded-lg mb-3">
                    <div className="flex items-center gap-4 text-sm mb-1">
                      {log.stopLoss && (
                        <div className="flex items-center gap-1">
                          <Shield className="h-4 w-4 text-red-500" />
                          <span className="text-muted-foreground">Stop Loss:</span>
                          <span className="font-medium">{formatCurrency(log.stopLoss)}</span>
                          <span className="text-xs text-red-600">
                            (-{Math.abs(((log.stopLoss - log.price) / log.price) * 100).toFixed(2)}%)
                          </span>
                        </div>
                      )}
                      {log.takeProfit && (
                        <div className="flex items-center gap-1">
                          <Target className="h-4 w-4 text-green-500" />
                          <span className="text-muted-foreground">Take Profit:</span>
                          <span className="font-medium">{formatCurrency(log.takeProfit)}</span>
                          <span className="text-xs text-green-600">
                            (+{Math.abs(((log.takeProfit - log.price) / log.price) * 100).toFixed(2)}%)
                          </span>
                        </div>
                      )}
                    </div>
                    {explainRiskManagement(log)}
                  </div>
                )}

                {/* Technical Indicators */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                  {log.indicators.rsi !== undefined && (
                    <div className="flex items-center gap-1">
                      {getIndicatorIcon(log.indicators.rsi, 'rsi')}
                      <div>
                        <div className="text-xs text-muted-foreground">RSI</div>
                        <div className="text-sm font-medium">{log.indicators.rsi.toFixed(1)}</div>
                      </div>
                    </div>
                  )}
                  {log.indicators.macd !== undefined && (
                    <div className="flex items-center gap-1">
                      {getIndicatorIcon(log.indicators.macd, 'macd')}
                      <div>
                        <div className="text-xs text-muted-foreground">MACD</div>
                        <div className="text-sm font-medium">{log.indicators.macd.toFixed(2)}</div>
                      </div>
                    </div>
                  )}
                  {(log.indicators.ema !== undefined || log.indicators.ema200 !== undefined) && (
                    <div>
                      <div className="text-xs text-muted-foreground">EMA200</div>
                      <div className="text-sm font-medium">
                        {(log.indicators.ema200 || log.indicators.ema || 0).toFixed(1)}
                      </div>
                    </div>
                  )}
                  {log.indicators.atr !== undefined && (
                    <div>
                      <div className="text-xs text-muted-foreground">ATR</div>
                      <div className="text-sm font-medium">{log.indicators.atr.toFixed(2)}</div>
                    </div>
                  )}
                  {log.indicators.sentiment !== undefined && (
                    <div className="flex items-center gap-1">
                      {getIndicatorIcon(log.indicators.sentiment, 'sentiment')}
                      <div>
                        <div className="text-xs text-muted-foreground">Sentiment</div>
                        <div className="text-sm font-medium">{log.indicators.sentiment.toFixed(2)}</div>
                      </div>
                    </div>
                  )}
                  {log.indicators.confluenceScore !== undefined && (
                    <div>
                      <div className="text-xs text-muted-foreground">Confluence</div>
                      <div className="text-sm font-medium">{(log.indicators.confluenceScore * 100).toFixed(0)}%</div>
                    </div>
                  )}
                  {log.indicators.multiTimeframe && (
                    <div>
                      <div className="text-xs text-muted-foreground">MTF Trend</div>
                      <div className="text-sm font-medium capitalize">{log.indicators.multiTimeframe.trend}</div>
                    </div>
                  )}
                </div>

                <Separator className="my-3" />

                {/* Decision Reasoning */}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Decision Reasoning</div>
                  <div className="text-sm leading-relaxed bg-muted/50 p-2 rounded">
                    {log.decisionReasoning}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};