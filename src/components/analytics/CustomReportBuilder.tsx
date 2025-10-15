import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface ReportConfig {
  name: string;
  date_range: { start: Date; end: Date };
  metrics: string[];
  assets: string[];
  groupBy: 'daily' | 'weekly' | 'monthly';
}

const availableMetrics = [
  { key: 'total_signals', label: 'Total Signals Generated' },
  { key: 'executed_trades', label: 'Executed Trades' },
  { key: 'win_rate', label: 'Win Rate' },
  { key: 'total_pnl', label: 'Total PnL' },
  { key: 'avg_confluence', label: 'Average Confluence Score' },
  { key: 'sharpe_ratio', label: 'Sharpe Ratio' },
  { key: 'max_drawdown', label: 'Maximum Drawdown' },
  { key: 'risk_reward', label: 'Average Risk/Reward' }
];

export function CustomReportBuilder() {
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [config, setConfig] = useState<Partial<ReportConfig>>({
    metrics: ['total_signals', 'win_rate', 'total_pnl'],
    groupBy: 'daily'
  });

  const toggleMetric = (metricKey: string) => {
    setConfig(prev => ({
      ...prev,
      metrics: prev.metrics?.includes(metricKey)
        ? prev.metrics.filter(m => m !== metricKey)
        : [...(prev.metrics || []), metricKey]
    }));
  };

  const generateReport = async () => {
    if (!user) {
      toast.error('Please sign in to generate reports');
      return;
    }

    setGenerating(true);
    try {
      // Generate report via edge function
      const { data, error } = await supabase.functions.invoke('generate-custom-report', {
        body: {
          user_id: user.id,
          config: config
        }
      });

      if (error) throw error;

      // Download the generated report
      toast.success('Report generated successfully!');
      
      // Trigger download
      const link = document.createElement('a');
      link.href = data.file_url;
      link.download = `trading-report-${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
    } catch (error: any) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Custom Report Builder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Date Range */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Date Range
          </Label>
          <Select value={config.groupBy} onValueChange={(value: any) => setConfig({ ...config, groupBy: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Last 30 Days (Daily)</SelectItem>
              <SelectItem value="weekly">Last 12 Weeks (Weekly)</SelectItem>
              <SelectItem value="monthly">Last 12 Months (Monthly)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Metrics Selection */}
        <div className="space-y-3">
          <Label>Metrics to Include</Label>
          <div className="grid grid-cols-2 gap-3">
            {availableMetrics.map((metric) => (
              <div key={metric.key} className="flex items-center space-x-2">
                <Checkbox
                  id={metric.key}
                  checked={config.metrics?.includes(metric.key)}
                  onCheckedChange={() => toggleMetric(metric.key)}
                />
                <label
                  htmlFor={metric.key}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {metric.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Format Selection */}
        <div className="space-y-2">
          <Label>Export Format</Label>
          <Select defaultValue="pdf">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF Report</SelectItem>
              <SelectItem value="csv">CSV Data Export</SelectItem>
              <SelectItem value="json">JSON Data Export</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Generate Button */}
        <Button 
          onClick={generateReport} 
          disabled={generating || !config.metrics?.length}
          className="w-full"
        >
          <Download className="mr-2 h-4 w-4" />
          {generating ? 'Generating Report...' : 'Generate & Download Report'}
        </Button>

        {/* Info Box */}
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-sm">
            <strong>Note:</strong> Reports are generated based on your historical trading data.
            Custom reports will be saved to your report history for future reference.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
