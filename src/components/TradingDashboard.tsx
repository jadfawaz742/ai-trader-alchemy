import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity } from 'lucide-react';
import AITradingModal from './AITradingModal';
import { PortfolioDashboard } from './PortfolioDashboard';
import { TradingInterface } from './TradingInterface';
import StockAnalyzer from './StockAnalyzer';
import { LiveTradingView } from './LiveTradingView';
import { AITradingTab } from './AITradingTab';
import { LiveAITrading } from './LiveAITrading';

const TradingDashboard: React.FC = () => {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">AI Trading Dashboard</h1>
        <Badge variant="outline" className="text-lg px-4 py-2">
          <Activity className="h-4 w-4 mr-2" />
          PPO Risk Management Active
        </Badge>
      </div>

      <Tabs defaultValue="portfolio" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="trading">Manual Trading</TabsTrigger>
          <TabsTrigger value="analyzer">Stock Analysis</TabsTrigger>
          <TabsTrigger value="ai-trading">AI Trading</TabsTrigger>
          <TabsTrigger value="live-view">Market View</TabsTrigger>
          <TabsTrigger value="live-ai">Live AI Trading</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio">
          <PortfolioDashboard />
        </TabsContent>

        <TabsContent value="trading">
          <TradingInterface />
        </TabsContent>

        <TabsContent value="analyzer">
          <StockAnalyzer />
        </TabsContent>

        <TabsContent value="ai-trading">
          <AITradingTab />
        </TabsContent>
        
        <TabsContent value="live-view">
          <LiveTradingView />
        </TabsContent>
        
        <TabsContent value="live-ai">
          <LiveAITrading />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TradingDashboard;