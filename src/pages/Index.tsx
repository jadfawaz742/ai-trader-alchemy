import StockAnalyzer from "@/components/StockAnalyzer";
import TradingDashboard from "@/components/TradingDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            AI Trading Bot
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            AI-powered stock analysis with PPO risk management and automated trading simulation
          </p>
        </div>
        
        <Tabs defaultValue="analysis" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="analysis" className="text-lg py-3">
              Stage 1: AI Analysis
            </TabsTrigger>
            <TabsTrigger value="trading" className="text-lg py-3">
              Stage 2: PPO Trading
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="analysis">
            <StockAnalyzer />
          </TabsContent>
          
          <TabsContent value="trading">
            <TradingDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
