import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Database, Zap, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CostData {
  edge_invocations: number;
  db_storage_gb: number;
  db_egress_gb: number;
  estimated_monthly: number;
}

export function CostMonitoring() {
  const [costs, setCosts] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCosts();
  }, []);

  const fetchCosts = async () => {
    setLoading(true);
    try {
      const { data: costData } = await supabase
        .from('infrastructure_costs')
        .select('*')
        .order('metric_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (costData) {
        setCosts({
          edge_invocations: costData.edge_function_invocations || 0,
          db_storage_gb: costData.database_storage_gb || 0,
          db_egress_gb: costData.database_egress_gb || 0,
          estimated_monthly: costData.estimated_cost || 0
        });
      }
    } catch (error) {
      console.error('Error fetching costs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !costs) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Infrastructure Costs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading cost data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Infrastructure Costs</CardTitle>
          <CardDescription>Edge function usage and database metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm text-muted-foreground">Edge Function Invocations</h4>
              </div>
              <p className="text-2xl font-bold">{costs.edge_invocations.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">This month</p>
            </div>
            
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm text-muted-foreground">Database Storage</h4>
              </div>
              <p className="text-2xl font-bold">{costs.db_storage_gb.toFixed(2)} GB</p>
              <p className="text-xs text-muted-foreground">Current usage</p>
            </div>
            
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm text-muted-foreground">Estimated Monthly Cost</h4>
              </div>
              <p className="text-2xl font-bold">${costs.estimated_monthly.toFixed(2)}</p>
              <div className="flex items-center gap-1 mt-1">
                <TrendingDown className="h-3 w-3 text-green-600" />
                <p className="text-xs text-green-600">Optimized</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Cost Breakdown</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 bg-muted rounded">
                <span className="text-sm">Edge Functions</span>
                <span className="text-sm font-medium">
                  ${((costs.edge_invocations / 1000000) * 2).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center p-2 bg-muted rounded">
                <span className="text-sm">Database Storage</span>
                <span className="text-sm font-medium">
                  ${(costs.db_storage_gb * 0.125).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center p-2 bg-muted rounded">
                <span className="text-sm">Database Egress</span>
                <span className="text-sm font-medium">
                  ${(costs.db_egress_gb * 0.09).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Optimization Opportunities</CardTitle>
          <CardDescription>Ways to reduce infrastructure costs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <Database className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Materialized Views Active</p>
                <p className="text-sm text-muted-foreground">
                  Using pre-computed views to reduce query costs
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
