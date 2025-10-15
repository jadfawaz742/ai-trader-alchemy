import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, TrendingUp, TrendingDown, Activity, Target, Shield } from "lucide-react";

interface RecurrentPPOTrainingMonitorProps {
  modelId?: string;
  curriculumStage: 'basic' | 'with_sr' | 'with_fib' | 'full';
  epochs: number;
  currentEpoch: number;
  metrics: {
    total_reward: number;
    pnl: number;
    num_trades: number;
    long_trades: number;
    short_trades: number;
    long_wins: number;
    short_wins: number;
    confluence_avg: number;
    fib_alignment_avg: number;
    max_drawdown: number;
    sharpe_ratio: number;
  };
  testMetrics?: {
    mar: number;
    max_drawdown: number;
    sharpe_ratio: number;
    win_rate: number;
    fib_alignment_ratio: number;
    long_payoff_ratio: number;
    short_payoff_ratio: number;
    passed_acceptance: boolean;
  };
}

export const RecurrentPPOTrainingMonitor = ({
  modelId,
  curriculumStage,
  epochs,
  currentEpoch,
  metrics,
  testMetrics
}: RecurrentPPOTrainingMonitorProps) => {
  const curriculumProgress = {
    'basic': 25,
    'with_sr': 50,
    'with_fib': 75,
    'full': 100
  };

  const longWinRate = metrics.long_trades > 0 ? (metrics.long_wins / metrics.long_trades) * 100 : 0;
  const shortWinRate = metrics.short_trades > 0 ? (metrics.short_wins / metrics.short_trades) * 100 : 0;
  const trainingProgress = epochs > 0 ? (currentEpoch / epochs) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Curriculum Progress */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Recurrent PPO Training
              </CardTitle>
              <CardDescription>
                Curriculum Stage: {curriculumStage.toUpperCase().replace('_', ' ')}
              </CardDescription>
            </div>
            <Badge variant={curriculumStage === 'full' ? 'default' : 'secondary'}>
              {curriculumStage === 'full' ? 'All Features' : 'Learning'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Curriculum Progress</span>
              <span>{curriculumProgress[curriculumStage]}%</span>
            </div>
            <Progress value={curriculumProgress[curriculumStage]} className="h-2" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Training Progress (Epoch {currentEpoch}/{epochs})</span>
              <span>{trainingProgress.toFixed(1)}%</span>
            </div>
            <Progress value={trainingProgress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Training Metrics */}
      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="structure">Structure</TabsTrigger>
          <TabsTrigger value="symmetry">Long/Short</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Reward</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.total_reward.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>PnL</CardDescription>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${metrics.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${metrics.pnl.toFixed(0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Sharpe Ratio</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.sharpe_ratio.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Max Drawdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {(metrics.max_drawdown * 100).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="structure" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Fibonacci Alignment
                </CardTitle>
                <CardDescription>
                  How well TPs align with Fib extensions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-3xl font-bold">
                    {(metrics.fib_alignment_avg * 100).toFixed(1)}%
                  </div>
                  <Progress value={metrics.fib_alignment_avg * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {metrics.fib_alignment_avg >= 0.7 ? '✅ Excellent' : metrics.fib_alignment_avg >= 0.6 ? '⚠️ Good' : '❌ Needs improvement'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Confluence Score
                </CardTitle>
                <CardDescription>
                  Average structural confluence at entry
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-3xl font-bold">
                    {(metrics.confluence_avg * 100).toFixed(1)}%
                  </div>
                  <Progress value={metrics.confluence_avg * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {metrics.confluence_avg >= 0.65 ? '✅ High quality' : metrics.confluence_avg >= 0.5 ? '⚠️ Moderate' : '❌ Low quality'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="symmetry" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Long Trades
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-3xl font-bold">{metrics.long_trades}</div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Win Rate: </span>
                    <span className="font-semibold">{longWinRate.toFixed(1)}%</span>
                  </div>
                  <Progress value={longWinRate} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  Short Trades
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-3xl font-bold">{metrics.short_trades}</div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Win Rate: </span>
                    <span className="font-semibold">{shortWinRate.toFixed(1)}%</span>
                  </div>
                  <Progress value={shortWinRate} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Symmetry Analysis
              </CardTitle>
              <CardDescription>
                Long vs Short performance balance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Balance (target ±20%)</span>
                  <span className={Math.abs(longWinRate - shortWinRate) <= 20 ? 'text-green-600' : 'text-orange-600'}>
                    {Math.abs(longWinRate - shortWinRate).toFixed(1)}% difference
                  </span>
                </div>
                {Math.abs(longWinRate - shortWinRate) <= 20 ? (
                  <p className="text-sm text-green-600">✅ Well balanced</p>
                ) : (
                  <p className="text-sm text-orange-600">⚠️ Bias detected</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Test Metrics */}
      {testMetrics && (
        <Card className={testMetrics.passed_acceptance ? 'border-green-500' : 'border-orange-500'}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Walk-Forward Test Results</CardTitle>
              <Badge variant={testMetrics.passed_acceptance ? 'default' : 'secondary'}>
                {testMetrics.passed_acceptance ? '✅ Passed' : '⚠️ Needs Review'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">MAR</div>
                <div className={`text-2xl font-bold ${testMetrics.mar >= 0.8 ? 'text-green-600' : 'text-orange-600'}`}>
                  {testMetrics.mar.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">Target: ≥0.80</div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">Max DD</div>
                <div className={`text-2xl font-bold ${testMetrics.max_drawdown <= 0.25 ? 'text-green-600' : 'text-orange-600'}`}>
                  {(testMetrics.max_drawdown * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Target: ≤25%</div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">Win Rate</div>
                <div className="text-2xl font-bold">{(testMetrics.win_rate * 100).toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">Target: ≥50%</div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">Fib Align</div>
                <div className={`text-2xl font-bold ${testMetrics.fib_alignment_ratio >= 0.6 ? 'text-green-600' : 'text-orange-600'}`}>
                  {(testMetrics.fib_alignment_ratio * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Target: ≥60%</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
