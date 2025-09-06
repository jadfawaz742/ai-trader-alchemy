import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Zap } from 'lucide-react';

interface Portfolio {
  id: string;
  name: string;
  current_balance: number;
}

export const TradingInterface: React.FC = () => {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [symbol, setSymbol] = useState('');
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [ppoSignal, setPpoSignal] = useState<any>(null);
  const [riskAssessment, setRiskAssessment] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPortfolio();
  }, []);

  const loadPortfolio = async () => {
    try {
      // Check authentication first
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

  const calculateTradeValue = () => {
    const qty = parseInt(quantity) || 0;
    const prc = parseFloat(price) || 0;
    return qty * prc;
  };

  const getMarketPrice = async () => {
    if (!symbol.trim()) return;
    
    setLoading(true);
    try {
      // Get current market data from our analyze-stock function
      const { data } = await supabase.functions.invoke('analyze-stock', {
        body: { symbol: symbol.toUpperCase(), analysisType: 'technical' }
      });

      if (data?.success && data?.marketData) {
        setPrice(data.marketData.currentPrice.toFixed(2));
        toast({
          title: "Market Price Updated",
          description: `Current price for ${symbol.toUpperCase()}: $${data.marketData.currentPrice.toFixed(2)}`
        });
      }
    } catch (error) {
      console.error('Error getting market price:', error);
      toast({
        title: "Error",
        description: "Failed to fetch current market price",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const assessTrade = async () => {
    if (!portfolio || !symbol.trim() || !quantity || !price) {
      toast({
        title: "Missing Information",
        description: "Please fill in all trade details first",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // This is a preview of what the execute-trade function would return
      // In a real implementation, we'd call a separate assessment endpoint
      const tradeValue = calculateTradeValue();
      const positionPercent = (tradeValue / portfolio.current_balance) * 100;
      
      // Mock PPO signal calculation
      const mockPPO = {
        ppo: (Math.random() - 0.5) * 4, // -2 to +2
        signal: Math.random() > 0.5 ? 'BUY' : Math.random() > 0.25 ? 'SELL' : 'HOLD',
        strength: Math.random() * 2
      };

      // Mock risk assessment
      const mockRisk = {
        score: Math.min(100, Math.max(0, 
          (positionPercent > 10 ? 30 : 0) + 
          (tradeType === 'BUY' && mockPPO.signal === 'SELL' ? 25 : 0) +
          (mockPPO.strength < 0.5 ? 15 : 0) +
          Math.random() * 20
        )),
        warnings: []
      };

      if (positionPercent > 10) {
        mockRisk.warnings.push(`Large position size: ${positionPercent.toFixed(1)}% of portfolio`);
      }
      if (tradeType === 'BUY' && mockPPO.signal === 'SELL') {
        mockRisk.warnings.push('Trading against PPO signal');
      }
      if (tradeType === 'BUY' && tradeValue > portfolio.current_balance) {
        mockRisk.warnings.push('Insufficient balance for this trade');
      }

      setPpoSignal(mockPPO);
      setRiskAssessment(mockRisk);

      toast({
        title: "Trade Assessment Complete",
        description: `Risk Score: ${mockRisk.score}% | PPO Signal: ${mockPPO.signal}`
      });
    } catch (error) {
      console.error('Error assessing trade:', error);
      toast({
        title: "Error",
        description: "Failed to assess trade risk",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const executeTrade = async () => {
    if (!portfolio || !symbol.trim() || !quantity || !price) {
      toast({
        title: "Missing Information",
        description: "Please fill in all trade details",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: {
          portfolioId: portfolio.id,
          symbol: symbol.toUpperCase(),
          tradeType,
          quantity: parseInt(quantity),
          currentPrice: parseFloat(price)
        }
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        toast({
          title: "Trade Executed Successfully!",
          description: `${tradeType} ${quantity} shares of ${symbol.toUpperCase()} at $${price}`
        });

        // Reset form
        setSymbol('');
        setQuantity('');
        setPrice('');
        setPpoSignal(null);
        setRiskAssessment(null);
        
        // Reload portfolio
        loadPortfolio();
      } else {
        throw new Error(data?.error || 'Trade execution failed');
      }
    } catch (error) {
      console.error('Error executing trade:', error);
      toast({
        title: "Trade Failed",
        description: error.message || "Failed to execute trade",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const getPPOSignalColor = (signal: string) => {
    switch (signal) {
      case 'BUY': return 'text-green-600';
      case 'SELL': return 'text-red-600';
      default: return 'text-yellow-600';
    }
  };

  const getRiskColor = (score: number) => {
    if (score <= 30) return 'text-green-600';
    if (score <= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          AI Trading Interface
        </CardTitle>
        <CardDescription>
          Execute trades with PPO analysis and risk management
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Portfolio Balance */}
        {portfolio && (
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm font-medium">Available Balance:</span>
            </div>
            <span className="text-lg font-bold">{formatCurrency(portfolio.current_balance)}</span>
          </div>
        )}

        {/* Trade Type Selection */}
        <div className="space-y-2">
          <Label>Trade Type</Label>
          <RadioGroup value={tradeType} onValueChange={(value) => setTradeType(value as 'BUY' | 'SELL')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="BUY" id="buy" />
              <Label htmlFor="buy" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Buy
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="SELL" id="sell" />
              <Label htmlFor="sell" className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                Sell
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Symbol Input */}
        <div className="space-y-2">
          <Label htmlFor="symbol">Stock Symbol</Label>
          <div className="flex gap-2">
            <Input
              id="symbol"
              placeholder="e.g., AAPL, TSLA, MSFT"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="uppercase"
            />
            <Button variant="outline" onClick={getMarketPrice} disabled={loading || !symbol.trim()}>
              Get Price
            </Button>
          </div>
        </div>

        {/* Quantity and Price */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              placeholder="Number of shares"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Price per Share</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        </div>

        {/* Trade Value */}
        {quantity && price && (
          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Total Trade Value:</span>
            <span className="text-lg font-bold">{formatCurrency(calculateTradeValue())}</span>
          </div>
        )}

        <Separator />

        {/* Risk Assessment Button */}
        <Button 
          onClick={assessTrade} 
          disabled={loading || !symbol.trim() || !quantity || !price}
          variant="outline"
          className="w-full"
        >
          Assess Trade Risk & PPO Signals
        </Button>

        {/* PPO Signal Display */}
        {ppoSignal && (
          <div className="space-y-3">
            <h4 className="font-semibold">PPO Analysis</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Signal</div>
                <Badge variant="outline" className={getPPOSignalColor(ppoSignal.signal)}>
                  {ppoSignal.signal}
                </Badge>
              </div>
              <div>
                <div className="text-muted-foreground">PPO Value</div>
                <div className="font-mono">{ppoSignal.ppo.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Strength</div>
                <div className="font-mono">{ppoSignal.strength.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Risk Assessment Display */}
        {riskAssessment && (
          <div className="space-y-3">
            <h4 className="font-semibold">Risk Assessment</h4>
            <div className="flex items-center justify-between">
              <span>Risk Score:</span>
              <Badge variant="outline" className={getRiskColor(riskAssessment.score)}>
                {riskAssessment.score.toFixed(0)}%
              </Badge>
            </div>
            {riskAssessment.warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1">
                    {riskAssessment.warnings.map((warning: string, index: number) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Execute Trade Button */}
        <Button 
          onClick={executeTrade} 
          disabled={loading || !symbol.trim() || !quantity || !price}
          className="w-full"
          variant={tradeType === 'BUY' ? 'default' : 'destructive'}
        >
          {loading ? 'Processing...' : `Execute ${tradeType} Order`}
        </Button>
      </CardContent>
    </Card>
  );
};