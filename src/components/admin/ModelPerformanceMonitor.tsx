import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";

interface ModelPerformanceMonitorProps {
  adminData: any;
}

export const ModelPerformanceMonitor = ({ adminData }: ModelPerformanceMonitorProps) => {
  const getPerformanceBadge = (metric: number | null, threshold: number) => {
    if (metric === null) return <Badge variant="secondary">No Data</Badge>;
    
    if (metric >= threshold) {
      return <Badge variant="default" className="gap-1">
        <TrendingUp className="h-3 w-3" />
        Good
      </Badge>;
    } else if (metric >= threshold * 0.8) {
      return <Badge variant="secondary" className="gap-1">
        <Minus className="h-3 w-3" />
        Fair
      </Badge>;
    } else {
      return <Badge variant="destructive" className="gap-1">
        <TrendingDown className="h-3 w-3" />
        Poor
      </Badge>;
    }
  };

  const modelsByAsset = adminData?.models?.stats?.by_asset || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Model Performance Overview</h2>
          <p className="text-muted-foreground">Active models and their performance metrics</p>
        </div>
      </div>

      {/* Performance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Models</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminData?.models?.stats?.total || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Models</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {adminData?.models?.stats?.active || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Shadow Models</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {adminData?.models?.stats?.shadow || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Deprecated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">
              {adminData?.models?.stats?.deprecated || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Model Details Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Model Performance by Asset
          </CardTitle>
          <CardDescription>
            Detailed metrics for each asset's trading models
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(modelsByAsset).length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Win Rate</TableHead>
                  <TableHead>Sharpe Ratio</TableHead>
                  <TableHead>Max Drawdown</TableHead>
                  <TableHead>Trades</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(modelsByAsset).map(([asset, stats]: [string, any]) => {
                  const metrics = stats.metrics;
                  const winRate = metrics?.win_rate ? (metrics.win_rate * 100) : null;
                  const sharpe = metrics?.sharpe;
                  const maxDD = metrics?.max_dd;
                  const totalTrades = metrics?.total_trades || 0;

                  return (
                    <TableRow key={asset}>
                      <TableCell className="font-medium">{asset}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {stats.latest_version}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {stats.active > 0 && <Badge variant="default">Active</Badge>}
                          {stats.shadow > 0 && <Badge variant="secondary">Shadow</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {winRate !== null ? (
                          <div className="space-y-1">
                            <div className="text-sm font-medium">{winRate.toFixed(1)}%</div>
                            {getPerformanceBadge(winRate, 50)}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {sharpe !== null ? (
                          <div className="space-y-1">
                            <div className="text-sm font-medium">{sharpe.toFixed(2)}</div>
                            {getPerformanceBadge(sharpe, 1.0)}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {maxDD !== null ? (
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-destructive">
                              {(maxDD * 100).toFixed(1)}%
                            </div>
                            <Progress value={Math.abs(maxDD * 100)} className="h-1" />
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{totalTrades}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No model performance data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
