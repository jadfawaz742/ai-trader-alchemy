import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, Clock, RefreshCw, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SystemHealthMonitorProps {
  adminData: any;
  onRefresh: () => void;
}

export const SystemHealthMonitor = ({ adminData, onRefresh }: SystemHealthMonitorProps) => {
  const getStatusBadge = (isHealthy: boolean) => {
    return isHealthy ? (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Healthy
      </Badge>
    ) : (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Issue Detected
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return "Never";
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return "Invalid date";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">System Health Status</h2>
        <Button onClick={onRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Component Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trading Orchestrator</CardTitle>
            <CardDescription>Live trading execution engine</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {getStatusBadge(!!adminData?.system.last_orchestrator)}
            <div className="text-sm text-muted-foreground">
              Last run: {formatTimestamp(adminData?.system.last_orchestrator)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inference Service</CardTitle>
            <CardDescription>Model prediction engine</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {getStatusBadge(!!adminData?.system.last_inference)}
            <div className="text-sm text-muted-foreground">
              Last run: {formatTimestamp(adminData?.system.last_inference)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Database</CardTitle>
            <CardDescription>Data persistence layer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {getStatusBadge(true)}
            <div className="text-sm text-muted-foreground">
              Connected and operational
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Errors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Recent System Errors
          </CardTitle>
          <CardDescription>
            Last 10 errors from cron jobs and edge functions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {adminData?.system.recent_errors?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Name</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminData.system.recent_errors.map((error: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{error.job_name}</TableCell>
                    <TableCell className="text-destructive text-sm">
                      {error.error_message || 'Unknown error'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatTimestamp(error.started_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
              <p>No recent errors detected</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cron Job History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Scheduled Job History
          </CardTitle>
          <CardDescription>Recent cron job executions</CardDescription>
        </CardHeader>
        <CardContent>
          {adminData?.cron_history?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminData.cron_history.slice(0, 10).map((job: any) => {
                  const duration = job.completed_at 
                    ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)
                    : null;
                  
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">{job.job_name}</TableCell>
                      <TableCell>
                        <Badge variant={job.status === 'success' ? 'default' : 'destructive'}>
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatTimestamp(job.started_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {duration ? `${duration}s` : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No cron job history available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
