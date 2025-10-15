import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle, Bell, Filter } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Alert {
  id: string;
  user_id: string;
  asset: string;
  alert_type: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

export const AlertManager = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterAcknowledged, setFilterAcknowledged] = useState("unacknowledged");

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('trading_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filterSeverity !== "all") {
        query = query.eq('severity', filterSeverity.toUpperCase());
      }

      if (filterAcknowledged === "unacknowledged") {
        query = query.eq('acknowledged', false);
      } else if (filterAcknowledged === "acknowledged") {
        query = query.eq('acknowledged', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAlerts(data || []);
    } catch (err: any) {
      console.error('Error fetching alerts:', err);
      toast.error('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();

    // Set up real-time subscription
    const channel = supabase
      .channel('alerts-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'trading_alerts'
      }, (payload) => {
        const newAlert = payload.new as Alert;
        setAlerts(prev => [newAlert, ...prev]);
        
        if (newAlert.severity === 'CRITICAL') {
          toast.error(`Critical Alert: ${newAlert.message}`, {
            duration: 10000,
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterSeverity, filterAcknowledged]);

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('trading_alerts')
        .update({ acknowledged: true })
        .eq('id', alertId);

      if (error) throw error;

      setAlerts(prev => 
        prev.map(alert => 
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        )
      );
      toast.success('Alert acknowledged');
    } catch (err: any) {
      console.error('Error acknowledging alert:', err);
      toast.error('Failed to acknowledge alert');
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, any> = {
      CRITICAL: 'destructive',
      HIGH: 'destructive',
      MEDIUM: 'secondary',
      LOW: 'outline',
    };
    return <Badge variant={variants[severity] || 'outline'}>{severity}</Badge>;
  };

  const getAlertTypeIcon = (type: string) => {
    if (type.includes('DRAWDOWN') || type.includes('RISK')) {
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    }
    return <Bell className="h-4 w-4 text-blue-500" />;
  };

  const alertStats = {
    total: alerts.length,
    unacknowledged: alerts.filter(a => !a.acknowledged).length,
    critical: alerts.filter(a => a.severity === 'CRITICAL').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Alert Management</h2>
          <p className="text-muted-foreground">Monitor and manage system alerts</p>
        </div>
        <Button onClick={fetchAlerts} variant="outline" size="sm">
          <Filter className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Alert Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alertStats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unacknowledged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{alertStats.unacknowledged}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{alertStats.critical}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Alerts</CardTitle>
          <CardDescription>Customize the alert view</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Severity</label>
              <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={filterAcknowledged} onValueChange={setFilterAcknowledged}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Alerts</SelectItem>
                  <SelectItem value="unacknowledged">Unacknowledged</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Feed</CardTitle>
          <CardDescription>Real-time system alerts and warnings</CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id} className={alert.acknowledged ? 'opacity-60' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getAlertTypeIcon(alert.alert_type)}
                        <span className="text-sm">{alert.alert_type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{alert.asset}</TableCell>
                    <TableCell>{getSeverityBadge(alert.severity)}</TableCell>
                    <TableCell className="max-w-md truncate">{alert.message}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      {!alert.acknowledged ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeAlert(alert.id)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Ack
                        </Button>
                      ) : (
                        <Badge variant="secondary">Acknowledged</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No alerts match the current filters</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
