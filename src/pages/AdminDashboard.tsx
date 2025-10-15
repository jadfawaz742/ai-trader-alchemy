import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, Activity, TrendingUp, AlertTriangle, Users, Cpu } from "lucide-react";
import { ModelPerformanceMonitor } from "@/components/admin/ModelPerformanceMonitor";
import { AlertManager } from "@/components/admin/AlertManager";
import { FeatureFlagManager } from "@/components/admin/FeatureFlagManager";
import { SystemHealthMonitor } from "@/components/admin/SystemHealthMonitor";
import { UserManagement } from "@/components/admin/UserManagement";
import { PerformanceCharts } from "@/components/admin/PerformanceCharts";
import { CostMonitoring } from '@/components/admin/CostMonitoring';
import { PortfolioAnalytics } from '@/components/analytics/PortfolioAnalytics';
import { CustomReportBuilder } from '@/components/analytics/CustomReportBuilder';

interface AdminData {
  models: {
    stats: {
      total: number;
      active: number;
      shadow: number;
      deprecated: number;
    };
  };
  training: {
    stats: {
      scheduled: number;
      running: number;
      complete: number;
      failed: number;
    };
  };
  online_learning: {
    stats: {
      last_7_days: number;
      avg_reward: number;
      avg_pnl: number;
    };
  };
  brokers: {
    active: number;
    pending: number;
    failed: number;
  };
  system: {
    trading_enabled: boolean;
    last_inference: string | null;
    last_orchestrator: string | null;
    recent_errors: any[];
  };
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdminCheck();
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate("/");
    }
  }, [isAdmin, adminLoading, navigate]);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('admin-dashboard');
      
      if (error) throw error;
      setAdminData(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching admin data:', err);
      setError(err.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
      const interval = setInterval(fetchAdminData, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [isAdmin]);

  if (adminLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">System monitoring and management</p>
        </div>
        <Badge variant={adminData?.system.trading_enabled ? "default" : "secondary"}>
          {adminData?.system.trading_enabled ? "Trading Active" : "Trading Paused"}
        </Badge>
      </div>

      {/* Quick Stats */}
      {adminData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Models
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminData.models.stats.active}</div>
              <p className="text-xs text-muted-foreground">
                {adminData.models.stats.shadow} shadow, {adminData.models.stats.total} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Training Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminData.training.stats.running}</div>
              <p className="text-xs text-muted-foreground">
                {adminData.training.stats.scheduled} scheduled, {adminData.training.stats.failed} failed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Online Learning
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminData.online_learning.stats.last_7_days}</div>
              <p className="text-xs text-muted-foreground">
                episodes (7d), avg PnL: {adminData.online_learning.stats.avg_pnl.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Broker Connections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminData.brokers.active}</div>
              <p className="text-xs text-muted-foreground">
                {adminData.brokers.pending} pending, {adminData.brokers.failed} failed
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="system" className="space-y-4">
        <TabsList>
          <TabsTrigger value="system">System Health</TabsTrigger>
          <TabsTrigger value="models">Model Performance</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="users">Users & Brokers</TabsTrigger>
          <TabsTrigger value="flags">Feature Flags</TabsTrigger>
          <TabsTrigger value="charts">Performance</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="system">
          <SystemHealthMonitor adminData={adminData} onRefresh={fetchAdminData} />
        </TabsContent>

        <TabsContent value="models">
          <ModelPerformanceMonitor adminData={adminData} />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertManager />
        </TabsContent>

        <TabsContent value="users">
          <UserManagement adminData={adminData} />
        </TabsContent>

        <TabsContent value="flags">
          <FeatureFlagManager adminData={adminData} onUpdate={fetchAdminData} />
        </TabsContent>

        <TabsContent value="charts">
          <PerformanceCharts />
        </TabsContent>

        <TabsContent value="costs" className="space-y-6">
          <CostMonitoring />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PortfolioAnalytics />
            <CustomReportBuilder />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDashboard;
