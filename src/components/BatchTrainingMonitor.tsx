import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, XCircle, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface BatchJob {
  id: string;
  symbol: string;
  status: 'queued' | 'training' | 'completed' | 'failed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  performance_metrics: any;
  training_data_points: number | null;
  attempt_count: number;
  curriculum_stage: string | null;
  use_augmentation: boolean | null;
}

export function BatchTrainingMonitor() {
  const [isStarting, setIsStarting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [permanentlyFailed, setPermanentlyFailed] = useState(0);
  const [deploymentVersion, setDeploymentVersion] = useState<string>('checking...');
  const [completedModels, setCompletedModels] = useState<number>(0);
  const [forceRetrain, setForceRetrain] = useState(false);
  const { toast } = useToast();

  // Real-time subscription to asset_models for completion tracking
  useEffect(() => {
    if (!batchId) return;
    
    const channel = supabase
      .channel('batch-training-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'asset_models'
        },
        (payload) => {
          console.log('New model trained:', payload.new);
          setCompletedModels(prev => prev + 1);
          
          toast({
            title: "Model Training Complete",
            description: `Successfully trained model for ${(payload.new as any).symbol}`,
          });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId, toast]);

  // Poll for status updates
  useEffect(() => {
    if (!batchId) return;

    const fetchStatus = async () => {
      const { data, error } = await supabase.functions.invoke('batch-train-assets', {
        body: { action: 'status', batchId }
      });

      if (error) {
        console.error('Error fetching batch status:', error);
        return;
      }

      if (data?.success) {
        setJobs(data.jobs);
        setStatusCounts(data.statusCounts);
        
        // Count permanent failures
        const permFailed = (data.jobs || []).filter((j: BatchJob) => 
          j.status === 'failed' && (
            j.attempt_count >= 999 || 
            j.error_message?.startsWith('[PERMANENT]')
          )
        ).length;
        setPermanentlyFailed(permFailed);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [batchId]);

  const startBatchTraining = async () => {
    setIsStarting(true);
    setCompletedModels(0);
    try {
      const { data, error } = await supabase.functions.invoke('batch-train-assets', {
        body: { 
          action: 'start',
          assetType: 'crypto', // Support 'crypto', 'stock', or 'both'
          cryptoMaxAssets: 431,
          forceRetrain: forceRetrain
        }
      });

      if (error) throw error;

      if (data?.success) {
        setBatchId(data.batchId);
        toast({
          title: "Batch Training Started",
          description: `Training ${data.queued} assets (${data.skipped} skipped). Watch real-time progress below.`,
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
      const { error } = await supabase.functions.invoke('batch-train-assets', {
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
        const { data: statusData } = await supabase.functions.invoke('batch-train-assets', {
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
          <>
            <div className="flex items-center space-x-2 p-4 bg-muted rounded-lg">
              <Checkbox 
                id="force-retrain" 
                checked={forceRetrain}
                onCheckedChange={(checked) => setForceRetrain(checked as boolean)}
              />
              <Label 
                htmlFor="force-retrain" 
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Force retrain existing models (with validation)
              </Label>
            </div>
            <div className="text-xs text-muted-foreground bg-blue-500/10 p-3 rounded border border-blue-500/20">
              ℹ️ {forceRetrain 
                ? "Will retrain ALL models and run walk-forward validation automatically" 
                : "Will only train models that don't exist yet (skips existing models)"}
            </div>
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
                  Start Batch Training {forceRetrain && "(Force Retrain)"}
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Progress ({completedModels} models trained)</span>
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

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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

              <div className="flex items-center gap-2 p-3 bg-orange-500/10 rounded-lg">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <div>
                  <div className="text-2xl font-bold">{(statusCounts.failed || 0) - permanentlyFailed}</div>
                  <div className="text-xs text-muted-foreground">Retryable</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg">
                <XCircle className="h-4 w-4 text-destructive" />
                <div>
                  <div className="text-2xl font-bold">{permanentlyFailed}</div>
                  <div className="text-xs text-muted-foreground">Invalid</div>
                </div>
              </div>
            </div>

            {((statusCounts.failed || 0) - permanentlyFailed) > 0 && (
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
                    Reset {(statusCounts.failed || 0) - permanentlyFailed} Retryable Jobs
                  </>
                )}
              </Button>
            )}
            
            {permanentlyFailed > 0 && (
              <div className="text-xs text-orange-500 bg-orange-500/10 p-3 rounded border border-orange-500/20">
                ⚠️ {permanentlyFailed} jobs failed permanently (invalid symbols or max retries)
              </div>
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
                    <div className="flex items-center gap-2 flex-1">
                      <span className="font-mono text-sm font-medium">{job.symbol}</span>
                      {job.status === 'training' && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {job.curriculum_stage && job.status !== 'skipped' && (
                        <Badge variant="outline" className="text-xs">
                          {job.curriculum_stage}
                        </Badge>
                      )}
                      {job.training_data_points && job.status === 'completed' && (
                        <span className="text-xs text-muted-foreground">
                          {job.training_data_points} bars
                        </span>
                      )}
                      {job.use_augmentation && (
                        <Badge variant="secondary" className="text-xs">
                          augmented
                        </Badge>
                      )}
                      {job.performance_metrics?.longWinRate && job.performance_metrics?.shortWinRate && (
                        <span className="text-xs text-muted-foreground">
                          L:{(job.performance_metrics.longWinRate * 100).toFixed(0)}% 
                          S:{(job.performance_metrics.shortWinRate * 100).toFixed(0)}%
                        </span>
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
          <p>• Adaptive training: full (500+ bars), with_sr (200-499), basic (50-199)</p>
          <p>• Data augmentation auto-enabled for assets with 30-50 bars</p>
          <p>• Comprehensive PPO with 31 features, action masking, structural alignment</p>
          <p>• Long/short symmetry tracking, Fibonacci alignment, confluence scores</p>
          <p>• Models are saved to your account automatically</p>
          <p className="pt-2 font-mono">Version: v3.0.0 Comprehensive PPO</p>
        </div>
      </CardContent>
    </Card>
  );
}
