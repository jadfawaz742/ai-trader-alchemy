import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Play, Square, Zap, AlertTriangle, Activity, AlertCircle } from 'lucide-react';

export function LiveTradingMasterControl() {
  const { user } = useAuth();
  const [tradingActive, setTradingActive] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [lastExecution, setLastExecution] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTradingStatus();
    const interval = setInterval(loadTradingStatus, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [user]);

  const loadTradingStatus = async () => {
    if (!user) return;

    try {
      // Check if user has enabled assets
      const { data: prefs } = await supabase
        .from('user_asset_prefs')
        .select('*')
        .eq('user_id', user.id)
        .eq('enabled', true);

      setTradingActive((prefs?.length || 0) > 0);

      // Get last execution time
      const { data: executions } = await supabase
        .from('executions')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (executions && executions.length > 0) {
        setLastExecution(executions[0].created_at);
      }
    } catch (error) {
      console.error('Error loading trading status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerCycle = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('trigger-trading-cycle', {
        body: {}
      });

      if (error) throw error;

      if (data.status === 'success') {
        toast.success('Trading cycle triggered successfully');
        await loadTradingStatus();
      } else if (data.status === 'paused') {
        toast.info('Trading is globally disabled');
      } else if (data.status === 'no_assets') {
        toast.warning('No active assets configured');
      }
    } catch (error: any) {
      console.error('Error triggering trading cycle:', error);
      toast.error('Failed to trigger trading cycle');
    } finally {
      setTriggering(false);
    }
  };

  const formatTimeSince = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
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

  return (
    <Card className="border-2 border-secondary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Activity className="h-6 w-6" />
          Trading Master Control
        </CardTitle>
        <CardDescription>
          Manually trigger automated trading cycles
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Trading Mode Indicator */}
        <div className="bg-secondary/20 border border-secondary rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary" className="text-base px-3 py-1">
              📄 Paper Trading Mode
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            All signals are simulated. No real money is at risk. Enable live trading per asset in "Trading Setup" to execute real trades.
          </p>
        </div>

        {/* Status Display */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Trading Status</div>
            <div className="flex items-center gap-2">
              {tradingActive ? (
                <>
                  <Badge variant="default" className="gap-1">
                    <Play className="h-3 w-3" />
                    Active
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Bot is ready to execute trades
                  </span>
                </>
              ) : (
                <>
                  <Badge variant="secondary" className="gap-1">
                    <Square className="h-3 w-3" />
                    Inactive
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    No active assets configured
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground mb-1">Last Execution</div>
            <div className="font-semibold">{formatTimeSince(lastExecution)}</div>
          </div>
        </div>

        {/* Info Notice */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Trading Cycle</AlertTitle>
          <AlertDescription>
            This will generate signals for all enabled assets. Signals will be executed as paper trades by default (unless live trading is explicitly enabled for specific assets).
          </AlertDescription>
        </Alert>

        {/* Control Buttons */}
        <div className="grid gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                size="lg" 
                className="w-full" 
                disabled={!tradingActive || triggering}
              >
                <Zap className="h-5 w-5 mr-2" />
                {triggering ? 'Executing...' : 'Trigger Trading Cycle Now'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Trading Cycle</AlertDialogTitle>
                <AlertDialogDescription>
                  This will immediately analyze markets and execute trades based on your configured assets and risk parameters.
                  <br /><br />
                  <strong>Real money will be used for these trades.</strong>
                  <br /><br />
                  Are you sure you want to proceed?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleTriggerCycle}>
                  Yes, Execute Trades
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="text-xs text-center text-muted-foreground">
            Automated trading runs periodically. Use manual trigger for immediate execution.
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Trading Mode</div>
            <div className="font-semibold">Live Trading</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Execution Method</div>
            <div className="font-semibold">PPO AI Model</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
