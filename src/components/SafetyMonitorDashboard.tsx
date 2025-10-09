import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Shield, AlertTriangle, CheckCircle, Activity, Clock, TrendingDown } from 'lucide-react';

interface SafetyAlert {
  asset: string;
  type: 'drawdown' | 'winrate' | 'latency';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
}

interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  updated_at: string;
}

export function SafetyMonitorDashboard() {
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [tradingEnabled, setTradingEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSafetyData();
    
    // Poll every 30 seconds
    const interval = setInterval(loadSafetyData, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadSafetyData = async () => {
    try {
      setLoading(true);

      // Check trading enabled flag
      const { data: flagData } = await supabase
        .from('feature_flags')
        .select('*');

      if (flagData) {
        setFeatureFlags(flagData);
        const tradingFlag = flagData.find(f => f.key === 'trading_enabled');
        setTradingEnabled(tradingFlag?.enabled ?? true);
      }

      // Load model metrics to check for safety issues
      const { data: metricsData } = await supabase
        .from('model_metrics')
        .select('*');

      // Load recent executions to check latency
      const fiveMinutesAgo = new Date();
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

      const { data: executionsData } = await supabase
        .from('executions')
        .select('asset, latency_ms, created_at')
        .gte('created_at', fiveMinutesAgo.toISOString())
        .order('created_at', { ascending: false });

      // Generate safety alerts
      const newAlerts: SafetyAlert[] = [];

      // Check drawdown
      metricsData?.forEach(metric => {
        if (metric.max_dd && metric.max_dd > 0.15) {
          newAlerts.push({
            asset: metric.asset,
            type: 'drawdown',
            severity: metric.max_dd > 0.20 ? 'critical' : 'warning',
            message: `Max drawdown exceeds ${metric.max_dd > 0.20 ? '20%' : '15%'} threshold`,
            value: metric.max_dd * 100,
            threshold: metric.max_dd > 0.20 ? 20 : 15,
            timestamp: metric.updated_at
          });
        }

        // Check win rate
        if (metric.win_rate && metric.total_trades >= 20 && metric.win_rate < 0.40) {
          newAlerts.push({
            asset: metric.asset,
            type: 'winrate',
            severity: metric.win_rate < 0.35 ? 'critical' : 'warning',
            message: `Win rate below ${metric.win_rate < 0.35 ? '35%' : '40%'} threshold`,
            value: metric.win_rate * 100,
            threshold: metric.win_rate < 0.35 ? 35 : 40,
            timestamp: metric.updated_at
          });
        }
      });

      // Check execution latency
      const assetLatencies: Record<string, number[]> = {};
      executionsData?.forEach(exec => {
        if (!assetLatencies[exec.asset]) {
          assetLatencies[exec.asset] = [];
        }
        if (exec.latency_ms) {
          assetLatencies[exec.asset].push(exec.latency_ms);
        }
      });

      Object.entries(assetLatencies).forEach(([asset, latencies]) => {
        if (latencies.length > 0) {
          const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
          if (avgLatency > 500) {
            newAlerts.push({
              asset,
              type: 'latency',
              severity: avgLatency > 1000 ? 'critical' : 'warning',
              message: `Average execution latency exceeds ${avgLatency > 1000 ? '1000ms' : '500ms'}`,
              value: avgLatency,
              threshold: avgLatency > 1000 ? 1000 : 500,
              timestamp: new Date().toISOString()
            });
          }
        }
      });

      setAlerts(newAlerts);
    } catch (error) {
      console.error('Error loading safety data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    return severity === 'critical' ? 'text-red-600' : 'text-yellow-600';
  };

  const getSeverityBg = (severity: string) => {
    return severity === 'critical' 
      ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800' 
      : 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'drawdown':
        return <TrendingDown className="h-4 w-4" />;
      case 'winrate':
        return <Activity className="h-4 w-4" />;
      case 'latency':
        return <Clock className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');

  return (
    <div className="space-y-6">
      {/* System Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Safety Monitor
              </CardTitle>
              <CardDescription>
                Real-time safety controls and automated risk management
              </CardDescription>
            </div>
            <Badge 
              variant={tradingEnabled ? "default" : "destructive"}
              className="text-lg px-4 py-2"
            >
              {tradingEnabled ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Trading Active
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Trading Paused
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Total Alerts</div>
              <div className="text-2xl font-bold">{alerts.length}</div>
            </div>
            <div className="bg-red-50 dark:bg-red-950 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Critical</div>
              <div className="text-2xl font-bold text-red-600">{criticalAlerts.length}</div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-950 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Warnings</div>
              <div className="text-2xl font-bold text-yellow-600">{warningAlerts.length}</div>
            </div>
            <div className="bg-green-50 dark:bg-green-950 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Status</div>
              <div className="text-lg font-bold text-green-600">
                {criticalAlerts.length === 0 ? 'Healthy' : 'Action Required'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Safety Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Safety Thresholds</CardTitle>
          <CardDescription>Automated monitoring limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Max Drawdown</span>
                <span className="text-sm text-muted-foreground">Limit: 20%</span>
              </div>
              <Progress value={15} max={20} className="h-2" />
              <div className="text-xs text-muted-foreground mt-1">
                Warning at 15% • Critical at 20% • Auto-pause enabled
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Min Win Rate</span>
                <span className="text-sm text-muted-foreground">Limit: 40%</span>
              </div>
              <Progress value={40} max={100} className="h-2" />
              <div className="text-xs text-muted-foreground mt-1">
                Warning at 40% • Critical at 35% • Min 20 trades required
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Execution Latency</span>
                <span className="text-sm text-muted-foreground">Limit: 1000ms</span>
              </div>
              <Progress value={500} max={1000} className="h-2" />
              <div className="text-xs text-muted-foreground mt-1">
                Warning at 500ms • Critical at 1000ms • 5min rolling avg
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Alerts */}
      <Card>
        <CardHeader>
          <CardTitle>Active Alerts</CardTitle>
          <CardDescription>
            {alerts.length === 0 ? 'No safety issues detected' : 'Issues requiring attention'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <p className="text-muted-foreground">All systems operating within safety parameters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert, idx) => (
                <Alert key={idx} className={getSeverityBg(alert.severity)}>
                  <div className="flex items-start gap-3">
                    <div className={getSeverityColor(alert.severity)}>
                      {getTypeIcon(alert.type)}
                    </div>
                    <div className="flex-1">
                      <AlertTitle className="flex items-center justify-between">
                        <span>{alert.asset}</span>
                        <Badge variant={alert.severity === 'critical' ? 'destructive' : 'default'}>
                          {alert.severity.toUpperCase()}
                        </Badge>
                      </AlertTitle>
                      <AlertDescription className="mt-2">
                        <div>{alert.message}</div>
                        <div className="mt-2 text-sm font-medium">
                          Current: {alert.value.toFixed(alert.type === 'latency' ? 0 : 1)}
                          {alert.type === 'latency' ? 'ms' : '%'} | 
                          Threshold: {alert.threshold}{alert.type === 'latency' ? 'ms' : '%'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(alert.timestamp).toLocaleString()}
                        </div>
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
