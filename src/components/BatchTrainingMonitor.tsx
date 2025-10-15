import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, XCircle, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BatchJob {
  id: string;
  symbol: string;
  status: 'queued' | 'training' | 'completed' | 'failed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  performance_metrics: any;
  training_data_points: number | null;
}

export function BatchTrainingMonitor() {
  const [isStarting, setIsStarting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [deploymentVersion, setDeploymentVersion] = useState<string>('checking...');
  const { toast } = useToast();

  // Poll for status updates
  useEffect(() => {
    if (!batchId) return;

    const fetchStatus = async () => {
      const { data, error } = await supabase.functions.invoke('batch-train-cryptos', {
        body: { action: 'status', batchId }
      });

      if (error) {
        console.error('Error fetching batch status:', error);
        return;
      }

      if (data?.success) {
        setJobs(data.jobs);
        setStatusCounts(data.statusCounts);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [batchId]);

  const startBatchTraining = async () => {
    setIsStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke('batch-train-cryptos', {
        body: { 
          action: 'start',
          maxAssets: 431,
          forceRetrain: false
        }
      });

      if (error) throw error;

      if (data?.success) {
        setBatchId(data.batchId);
        toast({
          title: "Batch Training Started",
          description: `Training ${data.queued} assets (${data.skipped} skipped)`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to Start Training",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const cancelBatch = async () => {
    if (!batchId) return;

    try {
      const { error } = await supabase.functions.invoke('batch-train-cryptos', {
        body: { action: 'cancel', batchId }
      });

      if (error) throw error;

      toast({
        title: "Batch Cancelled",
        description: "Training has been stopped",
      });

      setBatchId(null);
    } catch (error: any) {
      toast({
        title: "Failed to Cancel",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetFailedJobs = async () => {
    setIsResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('batch-training-admin', {
        body: { 
          action: 'reset-failed',
          batchId: batchId || undefined
        }
      });

      if (error) throw error;

      toast({
        title: "Failed Jobs Reset",
        description: `${data.resetCount} jobs moved back to queue`,
      });

      // Refresh status
      if (batchId) {
        const { data: statusData } = await supabase.functions.invoke('batch-train-cryptos', {
          body: { action: 'status', batchId }
        });
        
        if (statusData?.success) {
          setJobs(statusData.jobs);
          setStatusCounts(statusData.statusCounts);
        }
      }
    } catch (error: any) {
      toast({
        title: "Failed to Reset",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  // Check deployment version on mount
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('batch-training-admin', {
          body: { action: 'get-stats' }
        });
        
        if (!error && data?.success) {
          setDeploymentVersion('v2.0.0 ✅');
        }
      } catch {
        setDeploymentVersion('unknown');
      }
    };
    
    checkVersion();
  }, []);

  const totalJobs = jobs.length;
  const completedJobs = (statusCounts.completed || 0) + (statusCounts.skipped || 0);
  const progress = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;
  const isActive = statusCounts.queued > 0 || statusCounts.training > 0;

  const currentTraining = jobs.find(j => j.status === 'training');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch Model Training</CardTitle>
        <CardDescription>
          Train AI models for all 431 Binance USDT trading pairs
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!batchId ? (
          <Button 
            onClick={startBatchTraining} 
            disabled={isStarting}
            size="lg"
            className="w-full"
          >
            {isStarting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Batch Training
              </>
            )}
          </Button>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Progress</span>
                <span className="text-muted-foreground">
                  {completedJobs} / {totalJobs}
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {currentTraining && (
              <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">
                  Currently training: {currentTraining.symbol}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-2xl font-bold">{statusCounts.queued || 0}</div>
                  <div className="text-xs text-muted-foreground">Queued</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-blue-500/10 rounded-lg">
                <Loader2 className="h-4 w-4 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{statusCounts.training || 0}</div>
                  <div className="text-xs text-muted-foreground">Training</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">{statusCounts.completed || 0}</div>
                  <div className="text-xs text-muted-foreground">Completed</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <div>
                  <div className="text-2xl font-bold">{statusCounts.failed || 0}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
              </div>
            </div>

            {(statusCounts.failed || 0) > 0 && (
              <Button 
                onClick={resetFailedJobs}
                disabled={isResetting}
                variant="outline"
                size="sm"
                className="w-full"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    Reset {statusCounts.failed} Failed Jobs
                  </>
                )}
              </Button>
            )}

            {isActive && (
              <Button 
                onClick={cancelBatch} 
                variant="destructive"
                size="sm"
                className="w-full"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel Batch
              </Button>
            )}

            <ScrollArea className="h-[300px] w-full rounded-md border">
              <div className="p-4 space-y-2">
                {jobs.map((job) => (
                  <div 
                    key={job.id}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{job.symbol}</span>
                      {job.status === 'training' && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                    </div>
                    <Badge variant={
                      job.status === 'completed' ? 'default' :
                      job.status === 'failed' ? 'destructive' :
                      job.status === 'training' ? 'secondary' :
                      'outline'
                    }>
                      {job.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Training uses 2 years of historical data per asset</p>
          <p>• Estimated time: ~5 hours for all 431 assets</p>
          <p>• Models are saved to your account automatically</p>
          <p className="pt-2 font-mono">Deployment: {deploymentVersion}</p>
        </div>
      </CardContent>
    </Card>
  );
}
