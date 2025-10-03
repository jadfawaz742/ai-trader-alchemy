import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, TrendingUp, TrendingDown, Brain, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LearningLog {
  id: string;
  symbol: string;
  trade_action: string;
  entry_price: number;
  exit_price: number;
  profit_loss: number;
  outcome: string;
  confidence_level: number;
  confluence_score: number;
  market_condition: string;
  reasoning: string;
  indicators: any;
  created_at: string;
}

export function TradingLearningLogs() {
  const [logs, setLogs] = useState<LearningLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalTrades: 0,
    winRate: 0,
    totalPnL: 0,
    avgConfidence: 0
  });
  const { toast } = useToast();

  useEffect(() => {
    loadLearningLogs();
  }, []);

  const loadLearningLogs = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to view learning logs",
          variant: "destructive"
        });
        return;
      }

      // Get last 7 days of trades
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('trading_bot_learning')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      setLogs(data || []);

      // Calculate stats
      if (data && data.length > 0) {
        const totalTrades = data.length;
        const winningTrades = data.filter(t => t.outcome === 'WIN').length;
        const totalPnL = data.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
        const avgConfidence = data.reduce((sum, t) => sum + (t.confidence_level || 0), 0) / totalTrades;

        setStats({
          totalTrades,
          winRate: (winningTrades / totalTrades) * 100,
          totalPnL,
          avgConfidence
        });
      }
    } catch (error) {
      console.error('Error loading learning logs:', error);
      toast({
        title: "Error",
        description: "Failed to load learning logs",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Learning Database (Past 7 Days)
            </CardTitle>
            <CardDescription>
              All trades stored in the learning model for continuous improvement
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            {stats.totalTrades} Trades Logged
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1">Total Trades</div>
            <div className="text-2xl font-bold">{stats.totalTrades}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1">Win Rate</div>
            <div className={`text-2xl font-bold ${stats.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
              {formatPercentage(stats.winRate)}
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1">Total P&L</div>
            <div className={`text-2xl font-bold ${stats.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatCurrency(stats.totalPnL)}
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1">Avg Confidence</div>
            <div className="text-2xl font-bold">{formatPercentage(stats.avgConfidence)}</div>
          </div>
        </div>

        {/* Trade Logs */}
        <ScrollArea className="h-[600px] pr-4">
          {logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No learning data from the past 7 days. Run a backtest to generate learning data.
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge variant={log.trade_action === 'BUY' ? 'default' : 'secondary'} className="text-sm">
                        {log.symbol}
                      </Badge>
                      <Badge variant="outline">
                        {log.trade_action}
                      </Badge>
                      <Badge variant={log.outcome === 'WIN' ? 'default' : 'destructive'}>
                        {log.outcome}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${log.profit_loss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {log.profit_loss >= 0 ? <TrendingUp className="inline h-4 w-4" /> : <TrendingDown className="inline h-4 w-4" />}
                        {formatCurrency(log.profit_loss)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Entry:</span>
                      <span className="ml-2 font-medium">${log.entry_price.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Exit:</span>
                      <span className="ml-2 font-medium">${log.exit_price.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Confidence:</span>
                      <span className="ml-2 font-medium">{formatPercentage(log.confidence_level)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Confluence:</span>
                      <span className="ml-2 font-medium">{log.confluence_score.toFixed(2)}</span>
                    </div>
                  </div>

                  {log.indicators && (
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3 text-xs">
                      <div className="bg-muted/50 rounded px-2 py-1">
                        <div className="text-muted-foreground">RSI</div>
                        <div className="font-medium">{log.indicators.rsi?.toFixed(1)}</div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1">
                        <div className="text-muted-foreground">MACD</div>
                        <div className="font-medium">{log.indicators.macd?.toFixed(2)}</div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1">
                        <div className="text-muted-foreground">ATR</div>
                        <div className="font-medium">{log.indicators.atr?.toFixed(2)}</div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1">
                        <div className="text-muted-foreground">Market</div>
                        <div className="font-medium">{log.market_condition}</div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1">
                        <div className="text-muted-foreground">Fib Level</div>
                        <div className="font-medium">{log.indicators.fibonacciNearestLevel}</div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1">
                        <div className="text-muted-foreground">MTF</div>
                        <div className="font-medium">{log.indicators.multiTimeframe?.trend || 'N/A'}</div>
                      </div>
                    </div>
                  )}

                  <div className="text-sm bg-muted/30 rounded p-2">
                    <span className="text-muted-foreground font-medium">Decision Reasoning:</span>
                    <div className="mt-1">{log.reasoning}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
