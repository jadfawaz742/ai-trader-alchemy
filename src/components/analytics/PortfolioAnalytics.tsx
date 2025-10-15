import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PieChart, TrendingUp, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface RiskAttribution {
  asset: string;
  contribution_to_var: number;
  beta_to_portfolio: number;
  diversification_benefit: number;
}

interface PortfolioAnalyticsData {
  correlation_matrix: any[];
  risk_attribution: RiskAttribution[];
  asset_sharpe_ratios: Record<string, number>;
  optimization_suggestions: string[];
}

export function PortfolioAnalytics() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<PortfolioAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user]);

  const fetchAnalytics = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('portfolio-analytics', {
        body: { user_id: user.id }
      });

      if (error) throw error;
      setAnalytics(data);
    } catch (error: any) {
      console.error('Error fetching portfolio analytics:', error);
      toast.error('Failed to load portfolio analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading analytics...</p>
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Risk Attribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Risk Attribution
          </CardTitle>
          <CardDescription>
            How each asset contributes to your portfolio's overall risk
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>VaR Contribution</TableHead>
                <TableHead>Portfolio Beta</TableHead>
                <TableHead>Sharpe Ratio</TableHead>
                <TableHead>Diversification</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.risk_attribution.map((risk) => (
                <TableRow key={risk.asset}>
                  <TableCell className="font-medium">{risk.asset}</TableCell>
                  <TableCell>
                    <Badge variant={risk.contribution_to_var > 0.2 ? 'destructive' : 'secondary'}>
                      {(risk.contribution_to_var * 100).toFixed(2)}%
                    </Badge>
                  </TableCell>
                  <TableCell>{risk.beta_to_portfolio.toFixed(3)}</TableCell>
                  <TableCell>
                    {analytics.asset_sharpe_ratios[risk.asset]?.toFixed(2) || 'N/A'}
                  </TableCell>
                  <TableCell className="text-green-600">
                    +{(risk.diversification_benefit * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Optimization Suggestions */}
      {analytics.optimization_suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Optimization Suggestions
            </CardTitle>
            <CardDescription>
              AI-generated recommendations to improve your portfolio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.optimization_suggestions.map((suggestion, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <p className="text-sm">{suggestion}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Correlation Matrix Visualization */}
      {analytics.correlation_matrix.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Asset Correlation Matrix</CardTitle>
            <CardDescription>
              30-day rolling correlation between your traded assets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {analytics.correlation_matrix.map((corr: any, index: number) => (
                <div key={index} className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-xs text-muted-foreground mb-1">
                    {corr.asset1} × {corr.asset2}
                  </p>
                  <p className={`text-lg font-bold ${
                    corr.correlation > 0.5 ? 'text-green-600' : 
                    corr.correlation < -0.5 ? 'text-red-600' : 
                    'text-muted-foreground'
                  }`}>
                    {corr.correlation.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Values close to +1 indicate assets move together, -1 indicates opposite movement
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
