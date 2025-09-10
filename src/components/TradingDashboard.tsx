import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity } from 'lucide-react';
import AITradingModal from './AITradingModal';
import { PortfolioDashboard } from './PortfolioDashboard';
import { TradingInterface } from './TradingInterface';
import StockAnalyzer from './StockAnalyzer';
import { LiveTradingView } from './LiveTradingView';
import { UnifiedAITrading } from './UnifiedAITrading';
import { MarketActivityFeed } from './MarketActivityFeed';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface LiveTrade {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  timestamp: string;
  confidence: number;
  profitLoss: number;
  status: 'pending' | 'executed' | 'closed';
  duration: number;
  momentum?: string;
  volumeSpike?: boolean;
  simulation?: boolean;
  currentPrice?: number;
  closeReason?: 'stop_loss' | 'take_profit' | 'manual' | 'duration';
}

interface TradingSession {
  isActive: boolean;
  startTime: string;
  totalTrades: number;
  totalPnL: number;
  activeTrades: LiveTrade[];
  completedTrades: LiveTrade[];
  currentBalance: number;
  startingBalance: number;
}

const TradingDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState("portfolio");
  const [isLiveTrading, setIsLiveTrading] = useState(false);
  
  // Global trading state
  const [portfolio, setPortfolio] = useState<any>(null);
  const [tradingAmount, setTradingAmount] = useState('1000');
  const [riskLevel, setRiskLevel] = useState([50]);
  const [stopLoss, setStopLoss] = useState([5]);
  const [takeProfit, setTakeProfit] = useState([15]);
  const [tradeDuration, setTradeDuration] = useState([300]);
  const [simulationMode, setSimulationMode] = useState(true);
  
  const [session, setSession] = useState<TradingSession>({
    isActive: false,
    startTime: '',
    totalTrades: 0,
    totalPnL: 0,
    activeTrades: [],
    completedTrades: [],
    currentBalance: 0,
    startingBalance: 0
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const tradeUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Update isLiveTrading based on session state
  useEffect(() => {
    setIsLiveTrading(session.isActive);
  }, [session.isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (tradeUpdateRef.current) clearInterval(tradeUpdateRef.current);
    };
  }, []);

  const loadPortfolio = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('User not authenticated');
        return;
      }

      const { data } = await supabase
        .from('portfolios')
        .select('*')
        .limit(1)
        .single();
      
      if (data) {
        setPortfolio(data);
      }
    } catch (error) {
      console.error('Error loading portfolio:', error);
    }
  };

  useEffect(() => {
    loadPortfolio();
  }, []);

  // Note: Trade updates are handled by UnifiedAITrading component to prevent race conditions

  // Pass all trading props and functions to UnifiedAITrading
  const tradingProps = {
    portfolio,
    tradingAmount,
    setTradingAmount,
    riskLevel,
    setRiskLevel,
    stopLoss,
    setStopLoss,
    takeProfit,
    setTakeProfit,
    tradeDuration,
    setTradeDuration,
    simulationMode,
    setSimulationMode,
    session,
    setSession,
    intervalRef,
    tradeUpdateRef,
    loadPortfolio
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">AI Trading Dashboard</h1>
        <div className="flex items-center gap-3">
          {isLiveTrading && (
            <Badge variant="default" className="text-sm px-3 py-1 animate-pulse">
              <div className="w-2 h-2 bg-white rounded-full mr-2 animate-ping"></div>
              Live Trading Active
            </Badge>
          )}
          <Badge variant="outline" className="text-sm px-3 py-1">
            <Activity className="h-4 w-4 mr-2" />
            PPO Risk Management
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="trading">Manual Trading</TabsTrigger>
          <TabsTrigger value="analyzer">Stock Analysis</TabsTrigger>
          <TabsTrigger value="ai-trading" className="relative">
            AI Trading
            {isLiveTrading && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            )}
          </TabsTrigger>
          <TabsTrigger value="live-view">Market View</TabsTrigger>
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
          <UnifiedAITrading {...tradingProps} />
        </TabsContent>
        
        <TabsContent value="live-view">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <LiveTradingView />
            </div>
            <div>
              <MarketActivityFeed isActive={true} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TradingDashboard;