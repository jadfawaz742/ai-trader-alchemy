import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdvancedTradingBot from '@/components/AdvancedTradingBot';
import { TrainAssetModel } from '@/components/TrainAssetModel';
import { TradingLearningLogs } from '@/components/TradingLearningLogs';
import { OnlineLearningProgress } from '@/components/OnlineLearningProgress';
import { ModelManagementDashboard } from '@/components/ModelManagementDashboard';
import { BarChart3 } from 'lucide-react';

export function BacktestingDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTrainingComplete = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-blue-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-blue-400" />
            <div>
              <CardTitle className="text-2xl text-white">Backtesting & Model Training</CardTitle>
              <CardDescription className="text-gray-300">
                Test strategies, train models, and monitor AI learning progress
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Content Tabs */}
      <Tabs defaultValue="backtest" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 gap-2 bg-slate-800/50 border border-slate-700 p-2 h-auto">
          <TabsTrigger value="backtest" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            Backtest
          </TabsTrigger>
          <TabsTrigger value="train" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            Train Models
          </TabsTrigger>
          <TabsTrigger value="learning" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            AI Learning
          </TabsTrigger>
          <TabsTrigger value="online" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            Online Learning
          </TabsTrigger>
          <TabsTrigger value="models" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            Model Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="backtest" className="space-y-6">
          <AdvancedTradingBot />
        </TabsContent>

        <TabsContent value="train" className="space-y-6">
          <TrainAssetModel onTrainingComplete={handleTrainingComplete} />
        </TabsContent>

        <TabsContent value="learning" className="space-y-6">
          <TradingLearningLogs key={refreshKey} />
        </TabsContent>

        <TabsContent value="online" className="space-y-6">
          <OnlineLearningProgress />
        </TabsContent>

        <TabsContent value="models" className="space-y-6">
          <ModelManagementDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
