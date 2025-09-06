import StockAnalyzer from "@/components/StockAnalyzer";
import { PortfolioDashboard } from "@/components/PortfolioDashboard";
import { TradingInterface } from "@/components/TradingInterface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            AI Trading Bot - Stage 2
          </h1>
          <p className="text-xl text-gray-300">
            Advanced PPO Risk Management & Paper Trading
          </p>
        </div>
        
        <Tabs defaultValue="analysis" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="analysis">Stock Analysis</TabsTrigger>
            <TabsTrigger value="trading">Trading Interface</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio Dashboard</TabsTrigger>
          </TabsList>
          
          <TabsContent value="analysis" className="space-y-6">
            <StockAnalyzer />
          </TabsContent>
          
          <TabsContent value="trading" className="space-y-6">
            <TradingInterface />
          </TabsContent>
          
          <TabsContent value="portfolio" className="space-y-6">
            <PortfolioDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
