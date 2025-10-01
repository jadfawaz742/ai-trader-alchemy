import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface StockDataPoint {
  time: string;
  price: number;
  volume?: number;
}

interface StockChartProps {
  symbol: string;
  currentPrice?: number;
  tradeType?: 'BUY' | 'SELL';
  className?: string;
}

export const StockChart: React.FC<StockChartProps> = ({ 
  symbol, 
  currentPrice, 
  tradeType,
  className 
}) => {
  const [chartData, setChartData] = useState<StockDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [timeframe, setTimeframe] = useState('1D');

  // Fetch real historical data from Yahoo Finance
  const fetchHistoricalData = async () => {
    try {
      console.log(`[StockChart] Fetching historical data for ${symbol}, timeframe: ${timeframe}`);
      
      const rangeMap: Record<string, string> = {
        '1D': '1d',
        '1W': '5d',
        '1M': '1mo'
      };
      
      const intervalMap: Record<string, string> = {
        '1D': '5m',
        '1W': '30m',
        '1M': '1d'
      };
      
      const { data, error } = await supabase.functions.invoke('fetch-stock-history', {
        body: { 
          symbol, 
          range: rangeMap[timeframe],
          interval: intervalMap[timeframe]
        }
      });
      
      if (error) {
        console.error('[StockChart] Error from API:', error);
        return [];
      }
      
      if (!data || !data.history) {
        console.warn('[StockChart] No historical data returned');
        return [];
      }
      
      console.log(`[StockChart] Successfully fetched ${data.history.length} data points`);
      return data.history;
    } catch (error) {
      console.error('[StockChart] Error fetching stock history:', error);
      return [];
    }
  };

  const refreshData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchHistoricalData();
      if (data && data.length > 0) {
        setChartData(data);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (symbol) {
        setIsLoading(true);
        const data = await fetchHistoricalData();
        if (data && data.length > 0) {
          setChartData(data);
        }
        setIsLoading(false);
      }
    };
    loadData();
  }, [symbol, currentPrice, timeframe]);

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    if (timeframe === '1D') {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } else if (timeframe === '1W') {
      return date.toLocaleDateString('en-US', { 
        weekday: 'short',
        hour: 'numeric'
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const calculateChange = () => {
    if (chartData.length < 2) return { change: 0, percentage: 0 };
    
    const firstPrice = chartData[0].price;
    const lastPrice = currentPrice || chartData[chartData.length - 1].price;
    const change = lastPrice - firstPrice;
    const percentage = (change / firstPrice) * 100;
    
    return { change, percentage };
  };

  const { change, percentage } = calculateChange();
  const isPositive = change >= 0;

  const chartConfig = {
    price: {
      label: "Price",
      color: "hsl(var(--primary))",
    },
  };

  const displayPrice = currentPrice || (chartData.length > 0 ? chartData[chartData.length - 1].price : 0);

  return (
    <Card className={className}>
      <CardHeader className="pb-2 p-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              {symbol}
              {tradeType && (
                <Badge variant={tradeType === 'BUY' ? 'default' : 'destructive'} className="text-xs">
                  {tradeType}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Real-time data from Yahoo Finance
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-2xl font-bold">
                {formatCurrency(displayPrice)}
              </div>
              <div className={`flex items-center gap-1 text-sm ${
                isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {isPositive ? '+' : ''}{formatCurrency(change)} ({isPositive ? '+' : ''}{percentage.toFixed(2)}%)
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshData}
              disabled={isLoading}
            >
              <RotateCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {['1D', '1W', '1M'].map((tf) => (
            <Button
              key={tf}
              variant={timeframe === tf ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeframe(tf)}
              disabled={isLoading}
            >
              {tf}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-3">
        <ChartContainer config={chartConfig} className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                domain={['dataMin - 1', 'dataMax + 1']}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              />
              <ChartTooltip
                content={<ChartTooltipContent 
                  labelFormatter={(value) => formatTime(value)}
                  formatter={(value: any) => [formatCurrency(Number(value)), 'Price']}
                />}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ 
                  r: 4, 
                  fill: 'hsl(var(--primary))',
                  stroke: 'hsl(var(--background))',
                  strokeWidth: 2
                }}
              />
              {currentPrice && tradeType && (
                <ReferenceLine
                  y={currentPrice}
                  stroke={tradeType === 'BUY' ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
                  strokeDasharray="5 5"
                  label={{
                    value: `${tradeType} @ ${formatCurrency(currentPrice)}`,
                    position: 'insideTopRight',
                    fontSize: 12
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading real market data...</div>
          </div>
        )}

        {chartData.length === 0 && !isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">No market data available</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};