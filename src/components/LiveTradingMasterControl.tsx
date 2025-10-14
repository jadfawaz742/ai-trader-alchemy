import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Play, Square, Zap, AlertTriangle, Activity } from 'lucide-react';

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
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Activity className="h-6 w-6" />
          Live Trading Master Control
        </CardTitle>
        <CardDescription>
          Control automated trading execution and monitor trading status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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

        {/* Warning Notice */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-amber-500 mb-1">Live Trading Warning</div>
            <div className="text-muted-foreground">
              This will execute real trades with real money on your connected broker account.
              Ensure you have reviewed and tested your strategy thoroughly before starting.
            </div>
          </div>
        </div>

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
