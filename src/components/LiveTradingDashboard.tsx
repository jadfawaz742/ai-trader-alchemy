import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, TrendingUp, TrendingDown, Activity, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface PaperPosition {
  id: string;
  asset: string;
  side: string;
  qty: number;
  entry_price: number;
  sl: number;
  tp: number;
  pnl: number;
  status: string;
  created_at: string;
}

interface QueuedSignal {
  id: string;
  asset: string;
  side: string;
  qty: number;
  limit_price: number;
  sl: number;
  tp: number;
  status: string;
  created_at: string;
}

interface TradingAlert {
  id: string;
  asset: string;
  alert_type: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

interface AssetPref {
  asset: string;
  paper_trading_enabled: boolean;
  max_exposure_usd: number;
  risk_mode: string;
}

export function LiveTradingDashboard() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [queuedSignals, setQueuedSignals] = useState<QueuedSignal[]>([]);
  const [alerts, setAlerts] = useState<TradingAlert[]>([]);
  const [assetPrefs, setAssetPrefs] = useState<AssetPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [metrics, setMetrics] = useState({
    totalPnL: 0,
    winRate: 0,
    activePositions: 0,
    signalsToday: 0
  });

  useEffect(() => {
    if (user) {
      loadDashboardData();
      
      // Set up realtime subscription for alerts
      const channel = supabase
        .channel('trading-dashboard')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'trading_alerts',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            const newAlert = payload.new as TradingAlert;
            setAlerts(prev => [newAlert, ...prev]);
            
            // Show toast notification
            toast.error(`${newAlert.severity}: ${newAlert.message}`, {
              duration: 10000
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Load paper positions
      const { data: positionsData } = await supabase
        .from('paper_trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      setPositions(positionsData || []);

      // Load queued signals
      const { data: signalsData } = await supabase
        .from('signals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'queued')
        .order('created_at', { ascending: false });

      setQueuedSignals(signalsData || []);

      // Load alerts
      const { data: alertsData } = await supabase
        .from('trading_alerts')
        .select('*')
        .eq('user_id', user.id)
        .eq('acknowledged', false)
        .order('created_at', { ascending: false })
        .limit(10);

      setAlerts(alertsData || []);

      // Load asset preferences
      const { data: prefsData } = await supabase
        .from('user_asset_prefs')
        .select('asset, paper_trading_enabled, max_exposure_usd, risk_mode')
        .eq('user_id', user.id)
        .eq('enabled', true);

      setAssetPrefs(prefsData || []);

      // Calculate metrics
      const totalPnL = positionsData?.reduce((sum, p) => sum + (p.pnl || 0), 0) || 0;
      const winningTrades = positionsData?.filter(p => (p.pnl || 0) > 0).length || 0;
      const totalTrades = positionsData?.length || 0;
      
      // Count signals from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: todaySignalsCount } = await supabase
        .from('signals')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', today.toISOString());

      setMetrics({
        totalPnL,
        winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
        activePositions: positionsData?.length || 0,
        signalsToday: todaySignalsCount || 0
      });

    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const togglePaperTrading = async (asset: string, enabled: boolean) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_asset_prefs')
        .update({ paper_trading_enabled: enabled })
        .eq('user_id', user.id)
        .eq('asset', asset);

      if (error) throw error;

      toast.success(`${enabled ? 'Enabled' : 'Disabled'} paper trading for ${asset}`);
      loadDashboardData();
    } catch (error) {
      console.error('Error toggling paper trading:', error);
      toast.error('Failed to update trading mode');
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('trading_alerts')
        .update({ acknowledged: true })
        .eq('id', alertId);

      if (error) throw error;

      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  const processSignalsNow = async () => {
    if (!user) return;
    
    setProcessing(true);
    try {
      // Process each queued signal through paper-trade
      for (const signal of queuedSignals) {
        const { error } = await supabase.functions.invoke('paper-trade', {
          body: { signal_id: signal.id }
        });
        
        if (error) {
          console.error('Error processing signal:', error);
        }
      }
      
      toast.success('Processing signals...');
      
      // Reload dashboard after 2 seconds to see results
      setTimeout(() => {
        loadDashboardData();
      }, 2000);
    } catch (error) {
      console.error('Error processing signals:', error);
      toast.error('Failed to process signals');
    } finally {
      setProcessing(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'destructive';
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'default';
      case 'LOW': return 'secondary';
      default: return 'default';
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Live Trading Dashboard</h1>
        {queuedSignals.length > 0 && (
          <button
            onClick={processSignalsNow}
            disabled={processing}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {processing ? 'Processing...' : `Process ${queuedSignals.length} Queued Signal${queuedSignals.length > 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total PnL</CardTitle>
            {metrics.totalPnL >= 0 ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${metrics.totalPnL.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Activity className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.winRate.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activePositions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Signals Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.signalsToday}</div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map(alert => (
              <Alert key={alert.id} variant={getSeverityColor(alert.severity) === 'destructive' ? 'destructive' : 'default'}>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="flex items-center justify-between">
                  <span>{alert.alert_type.replace('_', ' ')} - {alert.asset}</span>
                  <Badge variant={getSeverityColor(alert.severity) as any}>{alert.severity}</Badge>
                </AlertTitle>
                <AlertDescription className="flex items-center justify-between">
                  <span>{alert.message}</span>
                  <button
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="text-xs underline"
                  >
                    Acknowledge
                  </button>
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Trading Mode Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Trading Mode</CardTitle>
          <CardDescription>Configure paper trading vs live trading per asset</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Max Exposure</TableHead>
                <TableHead>Risk Mode</TableHead>
                <TableHead>Paper Trading</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetPrefs.map(pref => (
                <TableRow key={pref.asset}>
                  <TableCell className="font-medium">{pref.asset}</TableCell>
                  <TableCell>
                    <Badge variant={pref.paper_trading_enabled !== false ? 'secondary' : 'default'}>
                      {pref.paper_trading_enabled !== false ? 'Paper' : 'Live'}
                    </Badge>
                  </TableCell>
                  <TableCell>${pref.max_exposure_usd}</TableCell>
                  <TableCell className="capitalize">{pref.risk_mode}</TableCell>
                  <TableCell>
                    <Switch
                      checked={pref.paper_trading_enabled !== false}
                      onCheckedChange={(checked) => togglePaperTrading(pref.asset, checked)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Queued Signals */}
      {queuedSignals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Queued Signals ({queuedSignals.length})</CardTitle>
            <CardDescription>Test trades waiting to be processed into paper trades</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>SL</TableHead>
                  <TableHead>TP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queuedSignals.map(signal => (
                  <TableRow key={signal.id}>
                    <TableCell className="font-medium">{signal.asset}</TableCell>
                    <TableCell>
                      <Badge variant={signal.side === 'BUY' ? 'default' : 'secondary'}>
                        {signal.side}
                      </Badge>
                    </TableCell>
                    <TableCell>{signal.qty}</TableCell>
                    <TableCell>${signal.limit_price?.toFixed(2) || '-'}</TableCell>
                    <TableCell>${signal.sl?.toFixed(2) || '-'}</TableCell>
                    <TableCell>${signal.tp?.toFixed(2) || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{signal.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(signal.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Active Positions */}
      <Card>
        <CardHeader>
          <CardTitle>Active Positions</CardTitle>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No active positions</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>SL</TableHead>
                  <TableHead>TP</TableHead>
                  <TableHead>PnL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map(pos => (
                  <TableRow key={pos.id}>
                    <TableCell className="font-medium">{pos.asset}</TableCell>
                    <TableCell>
                      <Badge variant={pos.side === 'BUY' ? 'default' : 'secondary'}>
                        {pos.side}
                      </Badge>
                    </TableCell>
                    <TableCell>{pos.qty}</TableCell>
                    <TableCell>${pos.entry_price.toFixed(2)}</TableCell>
                    <TableCell>${pos.sl?.toFixed(2) || '-'}</TableCell>
                    <TableCell>${pos.tp?.toFixed(2) || '-'}</TableCell>
                    <TableCell className={pos.pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                      ${pos.pnl?.toFixed(2) || '0.00'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}