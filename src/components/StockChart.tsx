import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, RotateCcw } from 'lucide-react';

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

  // Generate realistic mock data for demonstration
  const generateMockData = () => {
    const dataPoints = timeframe === '1D' ? 48 : timeframe === '1W' ? 168 : 720; // 30min intervals for 1D, 1h for 1W, 4h for 1M
    const basePrice = currentPrice || (Math.random() * 200 + 50);
    const data: StockDataPoint[] = [];
    
    let price = basePrice * 0.95; // Start slightly lower
    const now = new Date();
    
    for (let i = dataPoints; i >= 0; i--) {
      const intervalMinutes = timeframe === '1D' ? 30 : timeframe === '1W' ? 60 : 240;
      const time = new Date(now.getTime() - (i * intervalMinutes * 60 * 1000));
      
      // Create realistic price movement with trend toward current price
      const volatility = 0.02; // 2% volatility
      const trendFactor = i === 0 ? 1 : (1 + ((basePrice - price) / price) * 0.1); // Gradual trend toward target
      const randomChange = (Math.random() - 0.5) * volatility * price * trendFactor;
      
      price = Math.max(price + randomChange, basePrice * 0.8); // Prevent going too low
      
      // If this is the last point, set it to current price if available
      if (i === 0 && currentPrice) {
        price = currentPrice;
      }
      
      data.push({
        time: time.toISOString(),
        price: Number(price.toFixed(2)),
        volume: Math.floor(Math.random() * 1000000 + 100000)
      });
    }
    
    return data;
  };

  const refreshData = () => {
    setIsLoading(true);
    // Simulate API delay
    setTimeout(() => {
      setChartData(generateMockData());
      setIsLoading(false);
    }, 500);
  };

  useEffect(() => {
    if (symbol) {
      refreshData();
    }
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
    const lastPrice = chartData[chartData.length - 1].price;
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

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {symbol} Stock Chart
              {tradeType && (
                <Badge variant={tradeType === 'BUY' ? 'default' : 'destructive'}>
                  {tradeType}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Real-time price movements and trading signals
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-2xl font-bold">
                {currentPrice ? formatCurrency(currentPrice) : '--'}
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

        <div className="flex gap-2">
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

      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
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
              {/* Add reference line for current price if trading */}
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
            <div className="text-muted-foreground">Loading chart data...</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};