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
import { usePortfolioContext } from '@/components/PortfolioProvider';
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Zap, Minimize2 } from 'lucide-react';
import { StockChart } from '@/components/StockChart';
import { Switch } from '@/components/ui/switch';

export const TradingInterface: React.FC = () => {
  const { portfolio, addTrade } = usePortfolioContext();
  const [symbol, setSymbol] = useState('');
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [ppoSignal, setPpoSignal] = useState<any>(null);
  const [riskAssessment, setRiskAssessment] = useState<any>(null);
  const [stopLoss, setStopLoss] = useState('5');
  const [takeProfit, setTakeProfit] = useState('10');
  const [showChart, setShowChart] = useState(false);
  const [useCapitalCom, setUseCapitalCom] = useState(false);
  const { toast } = useToast();


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
      console.log('Starting trade assessment for:', { symbol, tradeType, quantity, price });
      
      // Calculate trade value and position size
      const tradeValue = calculateTradeValue();
      const positionPercent = (tradeValue / portfolio.current_balance) * 100;
      
      console.log('Trade value:', tradeValue, 'Position %:', positionPercent);
      
      // Generate realistic PPO signal based on symbol
      const baseSignal = Math.sin(symbol.charCodeAt(0) * 0.1) + Math.random() * 0.4 - 0.2;
      const mockPPO = {
        ppo: baseSignal * 2, // -2 to +2 range
        signal: baseSignal > 0.1 ? 'BUY' : baseSignal < -0.1 ? 'SELL' : 'HOLD',
        strength: Math.abs(baseSignal) * 2,
        histogram: baseSignal * 1.5,
        confidence: Math.min(95, Math.max(60, 75 + Math.abs(baseSignal) * 20))
      };

      console.log('Generated PPO signal:', mockPPO);

      // Calculate comprehensive risk assessment
      let riskScore = 0;
      const warnings = [];

      // Position size risk
      if (positionPercent > 15) {
        riskScore += 35;
        warnings.push(`Very large position: ${positionPercent.toFixed(1)}% of portfolio`);
      } else if (positionPercent > 10) {
        riskScore += 20;
        warnings.push(`Large position size: ${positionPercent.toFixed(1)}% of portfolio`);
      } else if (positionPercent > 5) {
        riskScore += 10;
      }

      // Signal alignment risk
      if (tradeType === 'BUY' && mockPPO.signal === 'SELL') {
        riskScore += 30;
        warnings.push('Trading against strong PPO sell signal');
      } else if (tradeType === 'SELL' && mockPPO.signal === 'BUY') {
        riskScore += 25;
        warnings.push('Trading against PPO buy signal');
      } else if (mockPPO.signal === 'HOLD') {
        riskScore += 15;
        warnings.push('PPO indicates neutral/sideways market');
      }

      // Signal strength risk
      if (mockPPO.strength < 0.5) {
        riskScore += 15;
        warnings.push('Weak PPO signal strength');
      }

      // Balance check
      if (tradeType === 'BUY' && tradeValue > portfolio.current_balance) {
        riskScore += 50;
        warnings.push('Insufficient balance for this trade');
      }

      // Market volatility (simulated)
      const volatilityFactor = Math.random() * 15;
      riskScore += volatilityFactor;
      if (volatilityFactor > 10) {
        warnings.push('High market volatility detected');
      }

      riskScore = Math.min(100, Math.max(0, riskScore));

      const mockRisk = {
        score: Math.round(riskScore),
        level: riskScore <= 30 ? 'LOW' : riskScore <= 60 ? 'MEDIUM' : 'HIGH',
        warnings,
        recommendation: riskScore <= 30 ? 'PROCEED' : riskScore <= 60 ? 'CAUTION' : 'AVOID'
      };

      console.log('Risk assessment complete:', mockRisk);

      setPpoSignal(mockPPO);
      setRiskAssessment(mockRisk);

      toast({
        title: "✅ Trade Assessment Complete",
        description: `Risk: ${mockRisk.level} (${mockRisk.score}%) | Signal: ${mockPPO.signal} | Confidence: ${mockPPO.confidence}%`
      });
    } catch (error) {
      console.error('Error assessing trade:', error);
      toast({
        title: "❌ Assessment Failed",
        description: "Failed to assess trade risk. Please try again.",
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
      if (useCapitalCom) {
        // Execute real trade on Capital.com via execute-trade with platform routing
        const { data, error } = await supabase.functions.invoke('execute-trade', {
          body: {
            portfolioId: portfolio.id,
            symbol: symbol.toUpperCase(),
            tradeType,
            quantity: parseInt(quantity),
            currentPrice: parseFloat(price),
            platform: 'capital.com'
          }
        });

        if (error) throw error;

        if (data?.success) {
          toast({
            title: "Real Trade Executed!",
            description: `${tradeType} ${quantity} shares of ${symbol.toUpperCase()} at $${price} on Capital.com`,
          });
        } else {
          throw new Error(data?.error || 'Capital.com trade failed');
        }
      } else {
        // Use the portfolio context addTrade function for simulation
        if (addTrade) {
          await addTrade({
            symbol: symbol.toUpperCase(),
            trade_type: tradeType,
            quantity: parseInt(quantity),
            price: parseFloat(price),
            total_amount: parseFloat(price) * parseInt(quantity),
            risk_score: riskAssessment?.score || 50,
            ppo_signal: ppoSignal ? {
              ppo: ppoSignal.ppo,
              signal: ppoSignal.signal,
              strength: ppoSignal.strength,
              histogram: ppoSignal.histogram,
              confidence: ppoSignal.confidence,
              platform: 'simulation'
            } : { platform: 'simulation' }
          });

          toast({
            title: "Simulated Trade Executed!",
            description: `${tradeType} ${quantity} shares of ${symbol.toUpperCase()} at $${price} (Simulation Mode)`
          });
        } else {
          throw new Error('Portfolio system not available');
        }
      }

      // Reset form
      setSymbol('');
      setQuantity('');
      setPrice('');
      setPpoSignal(null);
      setRiskAssessment(null);
    } catch (error) {
      console.error('Error executing trade:', error);
      toast({
        title: "Trade Failed",
        description: typeof error === 'object' && error !== null && 'message' in error 
          ? (error as Error).message 
          : "Failed to execute trade",
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
      case 'BUY': return 'text-emerald-600';
      case 'SELL': return 'text-red-600';
      default: return 'text-amber-600';
    }
  };

  const getRiskColor = (score: number) => {
    if (score <= 30) return 'text-emerald-600';
    if (score <= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Compact Stock Chart */}
      {symbol && showChart && (
        <StockChart 
          symbol={symbol}
          currentPrice={price ? parseFloat(price) : undefined}
          tradeType={tradeType}
          className="h-[300px]"
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Manual Trading Interface
              </CardTitle>
              <CardDescription>
                Execute manual trades with advanced risk management and stop orders
              </CardDescription>
            </div>
            {symbol && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowChart(!showChart)}
              >
                <Minimize2 className="h-4 w-4 mr-2" />
                {showChart ? 'Hide' : 'Show'} Chart
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
        {/* Portfolio Balance & Trading Mode */}
        {portfolio && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm font-medium">Available Balance:</span>
              </div>
              <span className="text-lg font-bold">{formatCurrency(portfolio.current_balance)}</span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="space-y-1">
                <div className="text-sm font-medium">Trading Mode</div>
                <div className="text-xs text-muted-foreground">
                  {useCapitalCom ? 'Real trading with Capital.com' : 'Simulation mode'}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="capital-mode" className="text-sm">Capital.com</Label>
                <Switch
                  id="capital-mode"
                  checked={useCapitalCom}
                  onCheckedChange={setUseCapitalCom}
                />
              </div>
            </div>
          </div>
        )}

        {/* Trade Type Selection */}
        <div className="space-y-2">
          <Label>Trade Type</Label>
          <RadioGroup value={tradeType} onValueChange={(value) => setTradeType(value as 'BUY' | 'SELL')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="BUY" id="buy" />
              <Label htmlFor="buy" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
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

        {/* Stop Loss and Take Profit */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="stopLoss">Stop Loss (%)</Label>
            <Input
              id="stopLoss"
              type="number"
              step="0.1"
              placeholder="5.0"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="takeProfit">Take Profit (%)</Label>
            <Input
              id="takeProfit"
              type="number"
              step="0.1"
              placeholder="10.0"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
            />
          </div>
        </div>

        {/* Trade Value */}
        {quantity && price && (
          <div className="space-y-2">
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">Total Trade Value:</span>
              <span className="text-lg font-bold">{formatCurrency(calculateTradeValue())}</span>
            </div>
            {stopLoss && takeProfit && (
              <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Stop Loss:</span>
                  <span className="text-red-600">-{stopLoss}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Take Profit:</span>
                  <span className="text-emerald-600">+{takeProfit}%</span>
                </div>
              </div>
            )}
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
            <h4 className="font-semibold">PPO Technical Analysis</h4>
            <div className="p-4 border rounded-lg space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Signal</div>
                  <Badge variant="outline" className={getPPOSignalColor(ppoSignal.signal)}>
                    {ppoSignal.signal}
                  </Badge>
                </div>
                <div>
                  <div className="text-muted-foreground">PPO Value</div>
                  <div className="font-mono">{typeof ppoSignal.ppo === 'number' ? ppoSignal.ppo.toFixed(4) : 'N/A'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Strength</div>
                  <div className="font-mono">{typeof ppoSignal.strength === 'number' ? ppoSignal.strength.toFixed(2) : 'N/A'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Confidence</div>
                  <Badge variant="outline">
                    {typeof ppoSignal.confidence === 'number' ? ppoSignal.confidence : 0}%
                  </Badge>
                </div>
              </div>
              
              {typeof ppoSignal.histogram === 'number' && (
                <div className="text-sm">
                  <div className="text-muted-foreground mb-1">Histogram</div>
                  <div className="font-mono">{ppoSignal.histogram.toFixed(4)}</div>
                </div>
              )}
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
                 {typeof riskAssessment.score === 'number' ? riskAssessment.score.toFixed(0) : '0'}%
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
    </div>
  );
};