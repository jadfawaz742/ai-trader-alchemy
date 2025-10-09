import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { ArrowUpCircle, CheckCircle, RotateCcw, AlertTriangle, TrendingUp } from 'lucide-react';

interface Model {
  id: string;
  asset: string;
  version: string;
  status: string;
  model_type: string;
  metadata: any;
  created_at: string;
  updated_at: string;
  location?: string;
}

interface ModelMetrics {
  asset: string;
  version: string;
  win_rate: number;
  sharpe: number;
  max_dd: number;
  total_trades: number;
  profitable_trades: number;
}

export function ModelManagementDashboard() {
  const { user } = useAuth();
  const [models, setModels] = useState<Model[]>([]);
  const [metrics, setMetrics] = useState<Record<string, ModelMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
    loadModels();
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();
    
    setIsAdmin(!!data);
  };

  const loadModels = async () => {
    try {
      setLoading(true);

      // Load all models
      const { data: modelsData } = await supabase
        .from('models')
        .select('*')
        .order('asset', { ascending: true })
        .order('updated_at', { ascending: false });

      // Load metrics for all models
      const { data: metricsData } = await supabase
        .from('model_metrics')
        .select('*');

      const metricsMap: Record<string, ModelMetrics> = {};
      metricsData?.forEach(m => {
        metricsMap[`${m.asset}-${m.version}`] = m;
      });

      setModels(modelsData || []);
      setMetrics(metricsMap);
    } catch (error) {
      console.error('Error loading models:', error);
      toast.error('Failed to load models');
    } finally {
      setLoading(false);
    }
  };

  const promoteModel = async (modelId: string, asset: string, version: string) => {
    if (!isAdmin) {
      toast.error('Only admins can promote models');
      return;
    }

    setPromoting(modelId);
    try {
      const { data, error } = await supabase.functions.invoke('promote-model', {
        body: { modelId, action: 'promote' }
      });

      if (error) throw error;

      toast.success(`Model ${asset}:${version} promoted to active`);
      await loadModels();
    } catch (error: any) {
      console.error('Error promoting model:', error);
      toast.error(error.message || 'Failed to promote model');
    } finally {
      setPromoting(null);
    }
  };

  const rollbackModel = async (modelId: string, asset: string) => {
    if (!isAdmin) {
      toast.error('Only admins can rollback models');
      return;
    }

    setPromoting(modelId);
    try {
      const { data, error } = await supabase.functions.invoke('promote-model', {
        body: { modelId, action: 'rollback' }
      });

      if (error) throw error;

      toast.success(`Rolled back ${asset} to previous version`);
      await loadModels();
    } catch (error: any) {
      console.error('Error rolling back model:', error);
      toast.error(error.message || 'Failed to rollback model');
    } finally {
      setPromoting(null);
    }
  };

  const getModelMetrics = (asset: string, version: string): ModelMetrics | null => {
    return metrics[`${asset}-${version}`] || null;
  };

  const canPromote = (shadowMetrics: ModelMetrics | null, activeMetrics: ModelMetrics | null): boolean => {
    if (!shadowMetrics) return false;
    if (!activeMetrics) return shadowMetrics.total_trades >= 20;
    
    return (
      shadowMetrics.total_trades >= 20 &&
      shadowMetrics.win_rate > activeMetrics.win_rate &&
      (shadowMetrics.sharpe || 0) > (activeMetrics.sharpe || 0) &&
      (shadowMetrics.max_dd || 0) < (activeMetrics.max_dd || 1)
    );
  };

  const groupedModels = models.reduce((acc, model) => {
    if (!acc[model.asset]) {
      acc[model.asset] = { active: null, shadow: null, archived: [] };
    }
    if (model.status === 'active') {
      acc[model.asset].active = model;
    } else if (model.status === 'shadow') {
      acc[model.asset].shadow = model;
    } else {
      acc[model.asset].archived.push(model);
    }
    return acc;
  }, {} as Record<string, { active: Model | null; shadow: Model | null; archived: Model[] }>);

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Model Management</CardTitle>
          <CardDescription>Admin access required</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You must be an admin to access model management features.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowUpCircle className="h-5 w-5" />
          Model Management & Promotion
        </CardTitle>
        <CardDescription>
          Promote shadow models to active when they outperform
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {Object.entries(groupedModels).map(([asset, { active, shadow, archived }]) => {
            const activeMetrics = active ? getModelMetrics(asset, active.version) : null;
            const shadowMetrics = shadow ? getModelMetrics(asset, shadow.version) : null;
            const promotable = canPromote(shadowMetrics, activeMetrics);

            return (
              <div key={asset} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">{asset}</h3>
                  {shadow && promotable && (
                    <Badge variant="default" className="bg-green-500">Ready to Promote</Badge>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Active Model */}
                  <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="default">Active</Badge>
                      {active && <span className="text-sm text-muted-foreground">{active.version}</span>}
                    </div>
                    {active && activeMetrics ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Win Rate:</span>
                          <span className="font-medium">{(activeMetrics.win_rate * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sharpe:</span>
                          <span className="font-medium">{(activeMetrics.sharpe || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max DD:</span>
                          <span className="font-medium text-red-600">
                            {((activeMetrics.max_dd || 0) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trades:</span>
                          <span className="font-medium">{activeMetrics.total_trades}</span>
                        </div>
                        {archived.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => active && rollbackModel(active.id, asset)}
                            disabled={promoting === active.id}
                            className="w-full mt-2"
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Rollback
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No active model</div>
                    )}
                  </div>

                  {/* Shadow Model */}
                  <div className="border rounded-lg p-4 bg-purple-50 dark:bg-purple-950">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="secondary">Shadow</Badge>
                      {shadow && <span className="text-sm text-muted-foreground">{shadow.version}</span>}
                    </div>
                    {shadow && shadowMetrics ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Win Rate:</span>
                          <span className={`font-medium ${shadowMetrics.win_rate > (activeMetrics?.win_rate || 0) ? 'text-green-600' : ''}`}>
                            {(shadowMetrics.win_rate * 100).toFixed(1)}%
                            {activeMetrics && shadowMetrics.win_rate > activeMetrics.win_rate && (
                              <TrendingUp className="inline h-3 w-3 ml-1" />
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sharpe:</span>
                          <span className={`font-medium ${(shadowMetrics.sharpe || 0) > (activeMetrics?.sharpe || 0) ? 'text-green-600' : ''}`}>
                            {(shadowMetrics.sharpe || 0).toFixed(2)}
                            {activeMetrics && (shadowMetrics.sharpe || 0) > (activeMetrics.sharpe || 0) && (
                              <TrendingUp className="inline h-3 w-3 ml-1" />
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max DD:</span>
                          <span className={`font-medium ${(shadowMetrics.max_dd || 0) < (activeMetrics?.max_dd || 1) ? 'text-green-600' : 'text-red-600'}`}>
                            {((shadowMetrics.max_dd || 0) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trades:</span>
                          <span className="font-medium">{shadowMetrics.total_trades}</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => promoteModel(shadow.id, asset, shadow.version)}
                          disabled={!promotable || promoting === shadow.id}
                          className="w-full mt-2"
                        >
                          {promoting === shadow.id ? (
                            <>Promoting...</>
                          ) : promotable ? (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Promote to Active
                            </>
                          ) : (
                            <>Needs {20 - shadowMetrics.total_trades} more trades</>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No shadow model training</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
