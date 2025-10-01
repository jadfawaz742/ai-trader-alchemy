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
    rsi: number;
    macd: number;
    ema: number;
    atr: number;
    sentiment: number;
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
                    <div className="text-sm text-muted-foreground">Confidence</div>
                    <div className="font-medium">{log.confidence.toFixed(1)}%</div>
                  </div>
                  {log.pnl !== undefined && (
                    <div>
                      <div className="text-sm text-muted-foreground">P&L</div>
                      <div className={`font-medium ${log.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(log.pnl)}
                      </div>
                      {log.exitPrice && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {log.action === 'BUY' 
                            ? `(${formatCurrency(log.exitPrice)} - ${formatCurrency(log.price)}) × ${log.quantity}`
                            : `(${formatCurrency(log.price)} - ${formatCurrency(log.exitPrice)}) × ${log.quantity}`
                          }
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Risk Management */}
                {(log.stopLoss || log.takeProfit) && (
                  <div className="flex items-center gap-4 mb-3 text-sm">
                    {log.stopLoss && (
                      <div className="flex items-center gap-1">
                        <Shield className="h-4 w-4 text-red-500" />
                        <span className="text-muted-foreground">Stop Loss:</span>
                        <span className="font-medium">{formatCurrency(log.stopLoss)}</span>
                      </div>
                    )}
                    {log.takeProfit && (
                      <div className="flex items-center gap-1">
                        <Target className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">Take Profit:</span>
                        <span className="font-medium">{formatCurrency(log.takeProfit)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Technical Indicators */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                  <div className="flex items-center gap-1">
                    {getIndicatorIcon(log.indicators.rsi, 'rsi')}
                    <div>
                      <div className="text-xs text-muted-foreground">RSI</div>
                      <div className="text-sm font-medium">{log.indicators.rsi.toFixed(1)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {getIndicatorIcon(log.indicators.macd, 'macd')}
                    <div>
                      <div className="text-xs text-muted-foreground">MACD</div>
                      <div className="text-sm font-medium">{log.indicators.macd.toFixed(2)}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">EMA</div>
                    <div className="text-sm font-medium">{log.indicators.ema.toFixed(1)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">ATR</div>
                    <div className="text-sm font-medium">{log.indicators.atr.toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {getIndicatorIcon(log.indicators.sentiment, 'sentiment')}
                    <div>
                      <div className="text-xs text-muted-foreground">Sentiment</div>
                      <div className="text-sm font-medium">{log.indicators.sentiment.toFixed(2)}</div>
                    </div>
                  </div>
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