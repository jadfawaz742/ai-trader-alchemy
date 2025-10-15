import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Unlink, Link as LinkIcon, TrendingUp } from "lucide-react";

interface UserManagementProps {
  adminData: any;
}

export const UserManagement = ({ adminData }: UserManagementProps) => {
  const brokerStats = adminData?.brokers || {};
  const brokersByName = brokerStats.by_broker || {};

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">User & Broker Management</h2>
        <p className="text-muted-foreground">Monitor active users and broker connections</p>
      </div>

      {/* Broker Connection Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-green-600" />
              Active Connections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{brokerStats.active || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Healthy broker connections</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{brokerStats.pending || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting verification</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Unlink className="h-4 w-4 text-destructive" />
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{brokerStats.failed || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Connection errors</p>
          </CardContent>
        </Card>
      </div>

      {/* Broker Details Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Broker Connection Details
          </CardTitle>
          <CardDescription>Connection status breakdown by broker</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(brokersByName).length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Broker</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(brokersByName).map(([broker, stats]: [string, any]) => {
                  const total = (stats.active || 0) + (stats.pending || 0) + (stats.failed || 0);
                  const healthPercentage = total > 0 ? ((stats.active || 0) / total) * 100 : 0;
                  
                  let healthBadge;
                  if (healthPercentage >= 80) {
                    healthBadge = <Badge variant="default">Healthy</Badge>;
                  } else if (healthPercentage >= 50) {
                    healthBadge = <Badge variant="secondary">Fair</Badge>;
                  } else {
                    healthBadge = <Badge variant="destructive">Poor</Badge>;
                  }

                  return (
                    <TableRow key={broker}>
                      <TableCell className="font-medium">{broker}</TableCell>
                      <TableCell>
                        <Badge variant="default" className="bg-green-600">
                          {stats.active || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {stats.pending || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">
                          {stats.failed || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{total}</TableCell>
                      <TableCell>{healthBadge}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No broker connection data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Asset Trading Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Most Active Assets</CardTitle>
          <CardDescription>Top assets by model deployment and trading activity</CardDescription>
        </CardHeader>
        <CardContent>
          {adminData?.models?.stats?.by_asset && Object.keys(adminData.models.stats.by_asset).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(adminData.models.stats.by_asset)
                .sort(([, a]: any, [, b]: any) => (b.active + b.shadow) - (a.active + a.shadow))
                .slice(0, 10)
                .map(([asset, stats]: [string, any]) => (
                  <div key={asset} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="font-medium">{asset}</div>
                    <div className="flex gap-2">
                      {stats.active > 0 && (
                        <Badge variant="default">{stats.active} Active</Badge>
                      )}
                      {stats.shadow > 0 && (
                        <Badge variant="secondary">{stats.shadow} Shadow</Badge>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No asset activity data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
