import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, RotateCcw, Activity } from 'lucide-react';

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
  const [livePrice, setLivePrice] = useState<number>(currentPrice || 0);
  const [isLive, setIsLive] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const basePrice = useRef<number>(currentPrice || (Math.random() * 200 + 50));

  // Generate realistic mock data for demonstration
  const generateMockData = () => {
    const dataPoints = timeframe === '1D' ? 48 : timeframe === '1W' ? 168 : 720; // 30min intervals for 1D, 1h for 1W, 4h for 1M
    const startPrice = basePrice.current;
    const data: StockDataPoint[] = [];
    
    let price = startPrice * 0.95; // Start slightly lower
    const now = new Date();
    
    for (let i = dataPoints; i >= 0; i--) {
      const intervalMinutes = timeframe === '1D' ? 30 : timeframe === '1W' ? 60 : 240;
      const time = new Date(now.getTime() - (i * intervalMinutes * 60 * 1000));
      
      // Create realistic price movement with trend toward current price
      const volatility = 0.02; // 2% volatility
      const trendFactor = i === 0 ? 1 : (1 + ((startPrice - price) / price) * 0.1); // Gradual trend toward target
      const randomChange = (Math.random() - 0.5) * volatility * price * trendFactor;
      
      price = Math.max(price + randomChange, startPrice * 0.8); // Prevent going too low
      
      // If this is the last point, set it to current price if available
      if (i === 0) {
        price = livePrice || currentPrice || price;
      }
      
      data.push({
        time: time.toISOString(),
        price: Number(price.toFixed(2)),
        volume: Math.floor(Math.random() * 1000000 + 100000)
      });
    }
    
    return data;
  };

  // Add live price updates
  const addLiveDataPoint = () => {
    const now = new Date();
    const currentTime = now.toISOString();
    
    // Simulate realistic price movement
    const volatility = 0.005; // 0.5% volatility per update
    const trend = (Math.random() - 0.5) * 0.001; // Small trend component
    const randomChange = (Math.random() - 0.5) * volatility * livePrice;
    const trendChange = trend * livePrice;
    
    const newPrice = Math.max(livePrice + randomChange + trendChange, basePrice.current * 0.85);
    setLivePrice(Number(newPrice.toFixed(2)));
    
    setChartData(prevData => {
      const newData = [...prevData];
      
      // Remove oldest point if we have too many
      if (newData.length > 50) {
        newData.shift();
      }
      
      // Add new point
      newData.push({
        time: currentTime,
        price: Number(newPrice.toFixed(2)),
        volume: Math.floor(Math.random() * 1000000 + 100000)
      });
      
      return newData;
    });
  };

  const refreshData = () => {
    setIsLoading(true);
    // Simulate API delay
    setTimeout(() => {
      setChartData(generateMockData());
      setIsLoading(false);
    }, 500);
  };

  const toggleLiveMode = () => {
    setIsLive(!isLive);
  };

  useEffect(() => {
    if (symbol) {
      basePrice.current = currentPrice || (Math.random() * 200 + 50);
      setLivePrice(basePrice.current);
      refreshData();
    }
  }, [symbol, currentPrice, timeframe]);

  // Live updates effect
  useEffect(() => {
    if (isLive && symbol) {
      intervalRef.current = setInterval(addLiveDataPoint, 1000); // Update every second
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isLive, symbol, livePrice]);

  // Update live price when currentPrice prop changes
  useEffect(() => {
    if (currentPrice && currentPrice !== livePrice) {
      setLivePrice(currentPrice);
      basePrice.current = currentPrice;
    }
  }, [currentPrice]);

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
    const currentDisplayPrice = isLive ? livePrice : (currentPrice || chartData[chartData.length - 1].price);
    const change = currentDisplayPrice - firstPrice;
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
                {formatCurrency(isLive ? livePrice : (currentPrice || 0))}
                {isLive && <Activity className="h-3 w-3 inline ml-1 text-green-500 animate-pulse" />}
              </div>
              <div className={`flex items-center gap-1 text-sm ${
                isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {isPositive ? '+' : ''}{formatCurrency(change)} ({isPositive ? '+' : ''}{percentage.toFixed(2)}%)
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant={isLive ? "default" : "outline"}
                size="sm"
                onClick={toggleLiveMode}
              >
                <Activity className={`h-4 w-4 ${isLive ? 'animate-pulse' : ''}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshData}
                disabled={isLoading || isLive}
              >
                <RotateCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {['1D', '1W', '1M'].map((tf) => (
            <Button
              key={tf}
              variant={timeframe === tf ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeframe(tf)}
              disabled={isLoading || isLive}
            >
              {tf}
            </Button>
          ))}
          {isLive && (
            <Badge variant="secondary" className="ml-2 animate-pulse">
              LIVE
            </Badge>
          )}
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
              {(currentPrice || isLive) && tradeType && (
                <ReferenceLine
                  y={isLive ? livePrice : currentPrice}
                  stroke={tradeType === 'BUY' ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
                  strokeDasharray="5 5"
                  label={{
                    value: `${tradeType} @ ${formatCurrency(isLive ? livePrice : currentPrice)}`,
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

        {isLive && (
          <div className="flex items-center justify-center py-2 text-sm text-muted-foreground">
            <Activity className="h-3 w-3 mr-1 animate-pulse" />
            Live price updates every second
          </div>
        )}
      </CardContent>
    </Card>
  );
};