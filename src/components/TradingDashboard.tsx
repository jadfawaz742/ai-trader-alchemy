import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, RotateCcw } from 'lucide-react';
import { PortfolioDashboard } from './PortfolioDashboard';
import { TradingInterface } from './TradingInterface';
import StockAnalyzer from './StockAnalyzer';
import { UnifiedAITrading } from './UnifiedAITrading';
import { useToast } from '@/hooks/use-toast';
import { usePortfolioContext } from '@/components/PortfolioProvider';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const [tradingAmount, setTradingAmount] = useState('10000');
  const [riskLevel, setRiskLevel] = useState([30]);
  const [stopLoss, setStopLoss] = useState([5]);
  const [takeProfit, setTakeProfit] = useState([15]);
  const [tradeDuration, setTradeDuration] = useState([30]);
  const [simulationMode, setSimulationMode] = useState(true);
  const { toast } = useToast();
const { portfolio, resetPortfolio, updateInitialBalance } = usePortfolioContext();

  const [session, setSession] = useState<TradingSession>({
    isActive: false,
    startTime: '',
    totalTrades: 0,
    totalPnL: 0,
    activeTrades: [],
    completedTrades: [],
    currentBalance: portfolio?.current_balance || 0,
    startingBalance: portfolio?.current_balance || 0
  });

const intervalRef = useRef<NodeJS.Timeout | null>(null);
const tradeUpdateRef = useRef<NodeJS.Timeout | null>(null);

// Funding dialog state
const [fundDialogOpen, setFundDialogOpen] = useState(false);
const [fundAmount, setFundAmount] = useState<string>('');

  useEffect(() => {
    if (portfolio && !session.isActive) {
      setSession(prev => ({
        ...prev,
        currentBalance: portfolio.current_balance,
        startingBalance: portfolio.current_balance
      }));
    }
  }, [portfolio, session.isActive]);

useEffect(() => {
  return () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (tradeUpdateRef.current) clearInterval(tradeUpdateRef.current);
  };
}, []);

// Keep fund amount in sync with portfolio balance
useEffect(() => {
  if (portfolio) setFundAmount(String(portfolio.current_balance))
}, [portfolio]);

  const tradingProps = useMemo(() => ({
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
    tradeUpdateRef
  }), [
    portfolio,
    tradingAmount,
    riskLevel,
    stopLoss,
    takeProfit,
    tradeDuration,
    simulationMode,
    session
  ]);

  return (
    <div className="space-y-6">
<div className="flex items-center justify-between">
  <h2 className="text-3xl font-bold tracking-tight text-white">Trading Dashboard</h2>
  <div className="flex items-center gap-3">
    <Button 
      variant="outline" 
      size="sm" 
      onClick={() => setFundDialogOpen(true)}
      className="text-white border-white hover:bg-white hover:text-black"
    >
      Set Investment Amount
    </Button>
    <Button 
      variant="outline" 
      size="sm" 
      onClick={resetPortfolio}
      className="text-white border-white hover:bg-white hover:text-black"
    >
      <RotateCcw className="h-4 w-4 mr-2" />
      Reset Portfolio
    </Button>
    {session.isActive && (
      <Badge variant="default" className="bg-green-600 text-white animate-pulse">
        Live Trading Active
      </Badge>
    )}
  </div>
</div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="trading">Manual Trading</TabsTrigger>
          <TabsTrigger value="analyzer">Stock Analysis</TabsTrigger>
          <TabsTrigger value="ai-trading" className="relative">
            AI Trading
            {session.isActive && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            )}
          </TabsTrigger>
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
        
        
      </Tabs>

      {/* Fund Portfolio Dialog */}
      <Dialog open={fundDialogOpen} onOpenChange={setFundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Investment Amount</DialogTitle>
            <DialogDescription>
              Choose how much cash your portfolio should have available for trading.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="fund-amount">Amount (USD)</Label>
            <Input
              id="fund-amount"
              type="number"
              min="0"
              step="100"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                const amount = parseFloat(fundAmount);
                if (isNaN(amount) || amount < 0) return;
                await updateInitialBalance(amount);
                setFundDialogOpen(false);
              }}
            >
              Save Amount
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TradingDashboard;