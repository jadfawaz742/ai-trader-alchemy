import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, Shield, ArrowLeft, AlertCircle } from "lucide-react";
import { SecurityMetricsCards } from "@/components/SecurityMetricsCards";
import { AuditLogViewer } from "@/components/AuditLogViewer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AuditLog {
  id: string;
  function_name: string;
  action: string;
  user_id: string | null;
  metadata: any;
  created_at: string;
}

const SecurityAudit = () => {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdminCheck();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalCalls: 0,
    uniqueUsers: 0,
    failedOps: 0,
    mostActiveFunction: ''
  });

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      toast({
        title: "Access Denied",
        description: "Admin privileges required to view security audit",
        variant: "destructive",
      });
      navigate("/");
    }
  }, [isAdmin, adminLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchAuditLogs();
      // Auto-refresh every 30 seconds
      const interval = setInterval(fetchAuditLogs, 30000);
      return () => clearInterval(interval);
    }
  }, [isAdmin]);

  const fetchAuditLogs = async () => {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      // Fetch logs from last 24 hours
      const { data: logsData, error: logsError } = await supabase
        .from('service_role_audit')
        .select('*')
        .gte('created_at', yesterday)
        .order('created_at', { ascending: false })
        .limit(100);

      if (logsError) throw logsError;

      setLogs(logsData || []);

      // Calculate metrics
      const totalCalls = logsData?.length || 0;
      const uniqueUsers = new Set(logsData?.map(log => log.user_id).filter(Boolean)).size;
      const failedOps = logsData?.filter(log => {
        const metadata = log.metadata as any;
        return metadata?.error || metadata?.status === 'error';
      }).length || 0;

      // Find most active function
      const functionCounts = logsData?.reduce((acc: Record<string, number>, log) => {
        acc[log.function_name] = (acc[log.function_name] || 0) + 1;
        return acc;
      }, {});
      
      const mostActiveFunction = functionCounts 
        ? Object.entries(functionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'
        : 'N/A';

      setMetrics({
        totalCalls,
        uniqueUsers,
        failedOps,
        mostActiveFunction
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: "Error",
        description: "Failed to fetch audit logs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    try {
      const csv = [
        ['Timestamp', 'Function', 'Action', 'User ID', 'Status', 'Metadata'],
        ...logs.map(log => [
          log.created_at,
          log.function_name,
          log.action,
          log.user_id || 'system',
          log.metadata?.status || 'unknown',
          JSON.stringify(log.metadata)
        ])
      ].map(row => row.join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `security-audit-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: "Audit logs exported to CSV",
      });
    } catch (error) {
      console.error('Error exporting logs:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export audit logs",
        variant: "destructive",
      });
    }
  };

  if (adminLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  // Check for suspicious patterns
  const hasHighFailureRate = metrics.failedOps > 50;
  const hasHighActivity = metrics.totalCalls > 1000;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to="/settings">
            <Button variant="ghost" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Settings
            </Button>
          </Link>
        </div>

        <div className="max-w-7xl mx-auto space-y-6">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-2">
              <Shield className="h-8 w-8 text-purple-400 mr-3" />
              <h1 className="text-4xl font-bold text-white">Security Audit Dashboard</h1>
            </div>
            <p className="text-gray-400">Monitor service role operations and detect potential security issues</p>
          </div>

          {/* Alert for suspicious activity */}
          {(hasHighFailureRate || hasHighActivity) && (
            <Alert className="border-yellow-600 bg-yellow-900/20">
              <AlertCircle className="h-4 w-4 text-yellow-400" />
              <AlertTitle className="text-yellow-400">Suspicious Activity Detected</AlertTitle>
              <AlertDescription className="text-yellow-200">
                {hasHighFailureRate && "High failure rate detected (>50 errors in 24h). "}
                {hasHighActivity && "Unusual activity spike detected (>1000 calls in 24h). "}
                Review the logs below for details.
              </AlertDescription>
            </Alert>
          )}

          <SecurityMetricsCards {...metrics} />
          
          <AuditLogViewer
            logs={logs}
            loading={loading}
            onRefresh={fetchAuditLogs}
            onExport={handleExport}
          />
        </div>
      </div>
    </div>
  );
};

export default SecurityAudit;
