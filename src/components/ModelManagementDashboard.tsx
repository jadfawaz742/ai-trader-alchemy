import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw, FileText, Activity } from 'lucide-react';

interface AssetModel {
  id: string;
  symbol: string;
  user_id: string;
  model_type: string;
  curriculum_stage: string;
  created_at: string;
  updated_at: string;
  training_data_points: number | null;
  performance_metrics: {
    win_rate?: number;
    sharpe_ratio?: number;
    max_drawdown?: number;
    total_trades?: number;
    profitable_trades?: number;
  } | null;
}

interface ModelValidation {
  id: string;
  model_id: string;
  asset: string;
  approved: boolean;
  created_at: string;
  train_months: number;
  test_months: number;
  total_windows: number;
  passed_windows: number;
  failed_windows: number;
  avg_test_win_rate: number;
  avg_test_sharpe: number;
  avg_test_drawdown: number;
  recommendation: string;
  full_report: any;
}

interface TrainingJob {
  symbol: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  curriculum_stage: string;
  error_message: string | null;
}

type ModelStatus = 'training' | 'trained' | 'validated' | 'failed' | 'not_validated' | 'pending_validation';

interface ModelWithStatus {
  model: AssetModel;
  validation: ModelValidation | null;
  trainingJob: TrainingJob | null;
  status: ModelStatus;
}

export function ModelManagementDashboard() {
  const { user } = useAuth();
  const [modelsWithStatus, setModelsWithStatus] = useState<ModelWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState<string | null>(null);
  const [selectedValidation, setSelectedValidation] = useState<ModelValidation | null>(null);

  useEffect(() => {
    if (user) {
      loadModels();
      
      // Subscribe to training job updates
      const jobsChannel = supabase
        .channel('training-jobs-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'batch_training_jobs',
            filter: `user_id=eq.${user.id}`
          },
          () => loadModels()
        )
        .subscribe();

      // Subscribe to validation updates
      const validationsChannel = supabase
        .channel('validations-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'model_validations'
          },
          () => loadModels()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(jobsChannel);
        supabase.removeChannel(validationsChannel);
      };
    }
  }, [user]);

  const loadModels = async () => {
    if (!user) return;
    
    try {
      setLoading(true);

      // Load user's asset models
      const { data: modelsData, error: modelsError } = await supabase
        .from('asset_models')
        .select('*')
        .eq('user_id', user.id)
        .order('symbol', { ascending: true })
        .order('updated_at', { ascending: false });

      if (modelsError) throw modelsError;

      // Get unique symbols
      const symbols = [...new Set(modelsData?.map(m => m.symbol) || [])];

      // Load validations for these symbols
      const { data: validationsData } = await supabase
        .from('model_validations')
        .select('*')
        .in('asset', symbols)
        .order('created_at', { ascending: false });

      // Load active training jobs
      const { data: jobsData } = await supabase
        .from('batch_training_jobs')
        .select('symbol, status, started_at, completed_at, curriculum_stage, error_message')
        .eq('user_id', user.id)
        .in('status', ['queued', 'training'])
        .order('created_at', { ascending: false });

      // Group by symbol (keep only latest model per symbol)
      const modelsBySymbol: Record<string, AssetModel> = {};
      modelsData?.forEach(model => {
        if (!modelsBySymbol[model.symbol]) {
          modelsBySymbol[model.symbol] = {
            ...model,
            performance_metrics: model.performance_metrics as AssetModel['performance_metrics']
          };
        }
      });

      // Attach validation & job status
      const modelsWithStatusData: ModelWithStatus[] = Object.values(modelsBySymbol).map(model => {
        const validation = validationsData?.find(v => v.asset === model.symbol && v.model_id === model.id);
        const trainingJob = jobsData?.find(j => j.symbol === model.symbol);
        
        let status: ModelStatus;
        if (trainingJob?.status === 'training' || trainingJob?.status === 'queued') {
          status = 'training';
        } else if ((model as any).model_status === 'pending_validation') {
          status = 'pending_validation';
        } else if ((model as any).model_status === 'active' || validation?.approved) {
          status = 'validated';
        } else if ((model as any).model_status === 'failed_validation' || validation?.approved === false) {
          status = 'failed';
        } else if (model.training_data_points && model.training_data_points > 0) {
          status = 'not_validated';
        } else {
          status = 'trained';
        }

        return { model, validation, trainingJob, status };
      });

      setModelsWithStatus(modelsWithStatusData);
    } catch (error) {
      console.error('Error loading models:', error);
      toast.error('Failed to load models');
    } finally {
      setLoading(false);
    }
  };

  const retrainModel = async (symbol: string) => {
    if (!user) return;
    
    setRetraining(symbol);
    try {
      const { error } = await supabase.functions.invoke('train-asset-model', {
        body: { 
          user_id: user.id, 
          symbol: symbol, 
          forceRetrain: true,
          use_augmentation: false 
        }
      });

      if (error) throw error;

      toast.success(`Started retraining ${symbol} with validation`);
      await loadModels();
    } catch (error: any) {
      console.error('Error retraining model:', error);
      toast.error(error.message || 'Failed to start retraining');
    } finally {
      setRetraining(null);
    }
  };

  const getStatusBadge = (status: ModelStatus) => {
    switch (status) {
      case 'training':
        return <Badge variant="default" className="bg-blue-500"><Activity className="h-3 w-3 mr-1" />Training</Badge>;
      case 'pending_validation':
        return <Badge variant="default" className="bg-orange-500">🔄 Pending Validation</Badge>;
      case 'validated':
        return <Badge variant="default" className="bg-green-500">✅ Validated</Badge>;
      case 'failed':
        return <Badge variant="destructive">❌ Failed</Badge>;
      case 'not_validated':
        return <Badge variant="secondary" className="bg-yellow-500">⚠️ Not Validated</Badge>;
      default:
        return <Badge variant="outline">Trained</Badge>;
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

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Model Management</CardTitle>
          <CardDescription>Please sign in to view your models</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Authentication required to access model management.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Model Training & Validation Status
          </CardTitle>
          <CardDescription>
            Monitor your trained models and their validation results
          </CardDescription>
        </CardHeader>
        <CardContent>
          {modelsWithStatus.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No models found. Start training models from the backtesting dashboard.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {modelsWithStatus.map(({ model, validation, trainingJob, status }) => (
                <Card key={model.id} className="p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">{model.symbol}</h3>
                    {getStatusBadge(status)}
                  </div>

                  {/* Training Progress */}
                  {status === 'training' && trainingJob && (
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium">Training in progress...</span>
                        <span className="text-muted-foreground">{trainingJob.curriculum_stage || 'full'}</span>
                      </div>
                      <Progress value={trainingJob.status === 'queued' ? 0 : 50} className="h-2" />
                      {trainingJob.started_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Started: {new Date(trainingJob.started_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Model Metrics */}
                  {model.performance_metrics && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold mb-2">Model Performance</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Win Rate:</span>
                          <span className="font-medium">
                            {model.performance_metrics.win_rate 
                              ? (model.performance_metrics.win_rate * 100).toFixed(1) + '%'
                              : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sharpe Ratio:</span>
                          <span className="font-medium">
                            {model.performance_metrics.sharpe_ratio?.toFixed(2) || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max Drawdown:</span>
                          <span className="font-medium text-destructive">
                            {model.performance_metrics.max_drawdown 
                              ? (model.performance_metrics.max_drawdown * 100).toFixed(1) + '%'
                              : 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Trades:</span>
                          <span className="font-medium">
                            {model.performance_metrics.total_trades || 0}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Training Points: {model.training_data_points || 0} | 
                        Updated: {new Date(model.updated_at).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {/* Validation Results */}
                  {validation && (
                    <div className="mb-4 p-3 border rounded-lg bg-muted/50">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-semibold">Walk-Forward Validation</h4>
                        {validation.approved ? (
                          <Badge variant="default" className="bg-green-500">Approved</Badge>
                        ) : (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm mb-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Windows Passed:</span>
                          <span className="font-medium">{validation.passed_windows}/{validation.total_windows}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Test Win Rate:</span>
                          <span className="font-medium">
                            {(validation.avg_test_win_rate * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Test Sharpe:</span>
                          <span className="font-medium">{validation.avg_test_sharpe.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Test Drawdown:</span>
                          <span className="font-medium text-destructive">
                            {(validation.avg_test_drawdown * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      {validation.recommendation && (
                        <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                          {validation.recommendation}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Error Message */}
                  {trainingJob?.error_message && (
                    <Alert variant="destructive" className="mb-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        {trainingJob.error_message}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    {validation && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedValidation(validation)}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        View Full Report
                      </Button>
                    )}
                    {status !== 'training' && (
                      <Button 
                        size="sm"
                        onClick={() => retrainModel(model.symbol)}
                        disabled={retraining === model.symbol}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${retraining === model.symbol ? 'animate-spin' : ''}`} />
                        {retraining === model.symbol ? 'Retraining...' : 'Retrain'}
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Validation Report Dialog */}
      <Dialog open={!!selectedValidation} onOpenChange={() => setSelectedValidation(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Validation Report: {selectedValidation?.asset}
            </DialogTitle>
          </DialogHeader>
          {selectedValidation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Validation Date:</span>
                  <p className="font-medium">{new Date(selectedValidation.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p className="font-medium">
                    {selectedValidation.approved ? '✅ Approved' : '❌ Failed'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Train Period:</span>
                  <p className="font-medium">{selectedValidation.train_months} months</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Test Period:</span>
                  <p className="font-medium">{selectedValidation.test_months} months</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Full Report</h4>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify(selectedValidation.full_report, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
