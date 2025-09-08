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

  // Update active trades with live P&L and auto-stop based on parameters
  useEffect(() => {
    if (session.isActive && session.activeTrades.length > 0) {
      tradeUpdateRef.current = setInterval(() => {
        setSession(prev => {
          const updatedActiveTrades = [];
          const newlyClosedTrades = [];

          prev.activeTrades.forEach(trade => {
            // Much more aggressive price simulation to trigger stops at YOUR parameters
            const volatilityFactor = riskLevel[0] / 100 * 0.25; // Increased from 0.15 to 0.25
            const momentumBoost = trade.momentum === 'bullish' ? 1.2 : trade.momentum === 'bearish' ? -1.2 : 0;
            const volumeBoost = trade.volumeSpike ? 1.5 : 1.0;
            
            // Create larger price swings
            const baseChange = (Math.random() - 0.5) * volatilityFactor * trade.price * volumeBoost;
            const momentumChange = momentumBoost * (Math.random() * 0.08 * trade.price); // Increased from 0.05
            const totalChange = baseChange + momentumChange;
            
            const currentPrice = Math.max(trade.price + totalChange, trade.price * 0.70); // Allow 30% drops

            const newPnL = trade.action === 'BUY' 
              ? (currentPrice - trade.price) * trade.quantity
              : (trade.price - currentPrice) * trade.quantity;

            const percentChange = ((currentPrice - trade.price) / trade.price) * 100;
            const actualPnLPercent = trade.action === 'BUY' ? percentChange : -percentChange;

            console.log(`${trade.symbol} ${trade.action}: P&L% = ${actualPnLPercent.toFixed(2)}%, YOUR Stop Loss = ${stopLoss[0]}%, YOUR Take Profit = ${takeProfit[0]}%`);

            // Use YOUR EXACT parameters for triggers
            const shouldStopLoss = actualPnLPercent <= -Math.abs(stopLoss[0]);
            const shouldTakeProfit = actualPnLPercent >= Math.abs(takeProfit[0]);

            if (shouldStopLoss || shouldTakeProfit) {
              newlyClosedTrades.push({
                ...trade,
                profitLoss: Number(newPnL.toFixed(2)),
                currentPrice: Number(currentPrice.toFixed(2)),
                status: 'closed' as const,
                closeReason: shouldStopLoss ? 'stop_loss' : 'take_profit'
              });

              console.log(`🚨 ${shouldStopLoss ? 'YOUR STOP LOSS' : 'YOUR TAKE PROFIT'} TRIGGERED for ${trade.symbol} at ${actualPnLPercent.toFixed(2)}% (Your setting: ${shouldStopLoss ? stopLoss[0] : takeProfit[0]}%)`);

              toast({
                title: shouldStopLoss ? `🔻 Stop Loss at ${stopLoss[0]}%` : `🚀 Take Profit at ${takeProfit[0]}%`,
                description: `${trade.symbol} ${trade.action} closed at ${shouldStopLoss ? '-' : '+'}${Math.abs(actualPnLPercent).toFixed(1)}% | P&L: ${newPnL >= 0 ? '+' : ''}$${newPnL.toFixed(2)}`,
                variant: shouldStopLoss ? "destructive" : "default"
              });
            } else {
              updatedActiveTrades.push({
                ...trade,
                profitLoss: Number(newPnL.toFixed(2)),
                currentPrice: Number(currentPrice.toFixed(2))
              });
            }
          });
          
          const totalActivePnL = updatedActiveTrades.reduce((sum, trade) => sum + trade.profitLoss, 0);
          const allCompletedTrades = [...prev.completedTrades, ...newlyClosedTrades];
          const completedPnL = allCompletedTrades.reduce((sum, trade) => sum + trade.profitLoss, 0);
          
          const newSession = {
            ...prev,
            activeTrades: updatedActiveTrades,
            completedTrades: allCompletedTrades,
            totalPnL: Number((totalActivePnL + completedPnL).toFixed(2)),
            currentBalance: prev.startingBalance + totalActivePnL + completedPnL
          };

          // Auto-stop trading if all trades are closed due to stop loss/take profit
          if (updatedActiveTrades.length === 0 && newlyClosedTrades.length > 0 && prev.activeTrades.length > 0) {
            // Clear intervals
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            if (tradeUpdateRef.current) {
              clearInterval(tradeUpdateRef.current);
              tradeUpdateRef.current = null;
            }
            
            toast({
              title: "Trading Auto-Stopped",
              description: "All positions closed due to stop loss/take profit triggers",
              variant: "default"
            });
            
            return { ...newSession, isActive: false };
          }
          
          return newSession;
        });
      }, 2000);
    } else if (tradeUpdateRef.current) {
      clearInterval(tradeUpdateRef.current);
      tradeUpdateRef.current = null;
    }

    return () => {
      if (tradeUpdateRef.current) {
        clearInterval(tradeUpdateRef.current);
        tradeUpdateRef.current = null;
      }
    };
  }, [session.isActive, session.activeTrades.length, riskLevel, stopLoss, takeProfit, toast, intervalRef]);

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