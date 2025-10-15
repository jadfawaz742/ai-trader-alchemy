import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, BarChart3, PieChart as PieChartIcon } from "lucide-react";

export const PerformanceCharts = () => {
  const [signalsData, setSignalsData] = useState<any[]>([]);
  const [alertsData, setAlertsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChartData();
  }, []);

  const fetchChartData = async () => {
    try {
      setLoading(true);

      // Fetch signals over time (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: signals } = await supabase
        .from('signals')
        .select('created_at, status')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      // Group signals by day
      const signalsByDay: Record<string, { generated: number; executed: number; blocked: number }> = {};
      
      signals?.forEach(signal => {
        const day = new Date(signal.created_at).toLocaleDateString();
        if (!signalsByDay[day]) {
          signalsByDay[day] = { generated: 0, executed: 0, blocked: 0 };
        }
        signalsByDay[day].generated++;
        if (signal.status === 'executed') signalsByDay[day].executed++;
        if (signal.status === 'blocked_by_risk') signalsByDay[day].blocked++;
      });

      const formattedSignals = Object.entries(signalsByDay).map(([date, data]) => ({
        date,
        ...data,
      }));

      setSignalsData(formattedSignals);

      // Fetch alert severity distribution
      const { data: alerts } = await supabase
        .from('trading_alerts')
        .select('severity')
        .gte('created_at', sevenDaysAgo.toISOString());

      const severityCounts: Record<string, number> = {};
      alerts?.forEach(alert => {
        severityCounts[alert.severity] = (severityCounts[alert.severity] || 0) + 1;
      });

      const formattedAlerts = Object.entries(severityCounts).map(([name, value]) => ({
        name,
        value,
      }));

      setAlertsData(formattedAlerts);
    } catch (err) {
      console.error('Error fetching chart data:', err);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    MEDIUM: '#eab308',
    LOW: '#84cc16',
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Performance Charts</h2>
        <p className="text-muted-foreground">Visual analytics of system performance</p>
      </div>

      {/* Signals Over Time */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Trading Signals (Last 7 Days)
          </CardTitle>
          <CardDescription>Signal generation, execution, and blocking trends</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={signalsData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="generated" stroke="hsl(var(--primary))" strokeWidth={2} name="Generated" />
              <Line type="monotone" dataKey="executed" stroke="#10b981" strokeWidth={2} name="Executed" />
              <Line type="monotone" dataKey="blocked" stroke="#ef4444" strokeWidth={2} name="Blocked" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Signal Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Signal Execution Rate
            </CardTitle>
            <CardDescription>Comparison of signal outcomes</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={signalsData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Legend />
                <Bar dataKey="executed" fill="#10b981" name="Executed" />
                <Bar dataKey="blocked" fill="#ef4444" name="Blocked" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Alert Severity Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5" />
              Alert Severity Distribution
            </CardTitle>
            <CardDescription>Breakdown of alert types</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={alertsData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {alertsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS] || '#6366f1'} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Cumulative Signal Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Cumulative Signal Trend
          </CardTitle>
          <CardDescription>Total signals generated over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={signalsData.map((item, idx) => ({
              ...item,
              cumulative: signalsData.slice(0, idx + 1).reduce((sum, d) => sum + d.generated, 0)
            }))}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="cumulative" 
                stroke="hsl(var(--primary))" 
                fill="hsl(var(--primary))" 
                fillOpacity={0.3}
                name="Total Signals"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};
