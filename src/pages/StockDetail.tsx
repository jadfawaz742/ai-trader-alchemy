import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, TrendingUp, TrendingDown, Activity, DollarSign, BarChart3, Zap, AlertTriangle } from 'lucide-react';
import { StockChart } from '@/components/StockChart';
import { MarketActivityFeed } from '@/components/MarketActivityFeed';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Mock detailed stock data
const getStockDetails = (symbol: string) => {
  const baseData = {
    'AAPL': { name: 'Apple Inc.', sector: 'Technology', cap: 'Large', price: 175.43, change: 2.34, changePercent: 1.35, volume: 45234567, marketCap: 2800000000000, pe: 28.5, dividend: 0.96, beta: 1.2 },
    'MSFT': { name: 'Microsoft Corporation', sector: 'Technology', cap: 'Large', price: 334.89, change: -1.23, changePercent: -0.37, volume: 23456789, marketCap: 2500000000000, pe: 32.1, dividend: 2.72, beta: 0.9 },
    'GOOGL': { name: 'Alphabet Inc.', sector: 'Technology', cap: 'Large', price: 138.21, change: 3.45, changePercent: 2.56, volume: 34567890, marketCap: 1800000000000, pe: 25.3, dividend: 0, beta: 1.1 },
    'TSLA': { name: 'Tesla Inc.', sector: 'Automotive', cap: 'Large', price: 242.67, change: 8.94, changePercent: 3.83, volume: 78901234, marketCap: 770000000000, pe: 65.2, dividend: 0, beta: 2.1 },
  };
  
  return baseData[symbol as keyof typeof baseData] || {
    name: `${symbol} Corporation`,
    sector: 'Technology',
    cap: 'Medium',
    price: 100 + Math.random() * 200,
    change: (Math.random() - 0.5) * 10,
    changePercent: (Math.random() - 0.5) * 5,
    volume: Math.floor(Math.random() * 50000000),
    marketCap: Math.floor(Math.random() * 1000000000000),
    pe: 20 + Math.random() * 40,
    dividend: Math.random() * 3,
    beta: 0.5 + Math.random() * 2
  };
};

const StockDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stockData, setStockData] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (symbol) {
      const data = getStockDetails(symbol.toUpperCase());
      setStockData(data);
    }
  }, [symbol]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatLargeNumber = (num: number) => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return formatCurrency(num);
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toString();
  };

  const analyzeStock = async () => {
    if (!symbol) return;
    
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('analyze-stock', {
        body: { symbol: symbol.toUpperCase(), analysisType: 'comprehensive' }
      });

      if (data?.success) {
        setAnalysis(data);
        toast({
          title: "Analysis Complete",
          description: `AI analysis for ${symbol.toUpperCase()} is ready`
        });
      }
    } catch (error) {
      console.error('Error analyzing stock:', error);
      toast({
        title: "Analysis Failed",
        description: "Could not analyze stock. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!symbol || !stockData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-2xl font-bold mb-4">Stock not found</h1>
          <Button asChild>
            <Link to="/stocks">Back to Stocks</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="outline" asChild>
              <Link to="/stocks">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Stocks
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold text-white font-mono">{symbol.toUpperCase()}</h1>
                <Badge variant="outline" className="text-white border-white">
                  {stockData.cap} Cap
                </Badge>
                <Badge variant="secondary">
                  {stockData.sector}
                </Badge>
              </div>
              <p className="text-xl text-gray-300">{stockData.name}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-white mb-1">
              {formatCurrency(stockData.price)}
            </div>
            <div className={`flex items-center justify-end gap-1 text-lg font-semibold ${
              stockData.change >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {stockData.change >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {stockData.change >= 0 ? '+' : ''}{stockData.change.toFixed(2)} ({stockData.changePercent >= 0 ? '+' : ''}{stockData.changePercent.toFixed(2)}%)
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart and Analysis */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stock Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Price Chart
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StockChart 
                  symbol={symbol.toUpperCase()}
                  currentPrice={stockData.price}
                  className="h-[400px]"
                />
              </CardContent>
            </Card>

            {/* Analysis Tabs */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    AI Analysis & Insights
                  </CardTitle>
                  <Button onClick={analyzeStock} disabled={loading}>
                    {loading ? 'Analyzing...' : 'Get AI Analysis'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="technical">Technical</TabsTrigger>
                    <TabsTrigger value="news">News & Sentiment</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="overview" className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Market Cap</p>
                        <p className="text-lg font-bold">{formatLargeNumber(stockData.marketCap)}</p>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">P/E Ratio</p>
                        <p className="text-lg font-bold">{stockData.pe.toFixed(1)}</p>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Dividend Yield</p>
                        <p className="text-lg font-bold">{stockData.dividend.toFixed(2)}%</p>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">Beta</p>
                        <p className="text-lg font-bold">{stockData.beta.toFixed(2)}</p>
                      </div>
                    </div>
                    
                    {analysis?.companyInfo && (
                      <div className="p-4 bg-muted rounded-lg">
                        <h4 className="font-semibold mb-2">Company Overview</h4>
                        <p className="text-sm text-muted-foreground">{analysis.companyInfo}</p>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="technical" className="space-y-4">
                    {analysis?.technicalAnalysis ? (
                      <div className="space-y-4">
                        <div className="p-4 bg-muted rounded-lg">
                          <h4 className="font-semibold mb-2">Technical Indicators</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">RSI:</span>
                              <span className="ml-2 font-medium">{analysis.technicalAnalysis.rsi}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">MACD:</span>
                              <span className="ml-2 font-medium">{analysis.technicalAnalysis.macd}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-4 bg-muted rounded-lg">
                          <h4 className="font-semibold mb-2">Recommendation</h4>
                          <p className="text-sm">{analysis.recommendation}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Click "Get AI Analysis" to see technical analysis</p>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="news" className="space-y-4">
                    {analysis?.newsAnalysis ? (
                      <div className="space-y-4">
                        <div className="p-4 bg-muted rounded-lg">
                          <h4 className="font-semibold mb-2">Sentiment Analysis</h4>
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <p className="text-2xl font-bold">{analysis.sentimentScore}</p>
                              <p className="text-xs text-muted-foreground">Sentiment Score</p>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm">{analysis.newsAnalysis}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Click "Get AI Analysis" to see news sentiment</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Live Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Volume</span>
                  <span className="font-medium">{formatVolume(stockData.volume)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Day Range</span>
                  <span className="font-medium text-xs">
                    {formatCurrency(stockData.price * 0.98)} - {formatCurrency(stockData.price * 1.02)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">52W Range</span>
                  <span className="font-medium text-xs">
                    {formatCurrency(stockData.price * 0.7)} - {formatCurrency(stockData.price * 1.3)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Avg Volume</span>
                  <span className="font-medium">{formatVolume(stockData.volume * 0.8)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full" onClick={() => navigate(`/?trade=${symbol}`)}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Trade This Stock
                </Button>
                <Button variant="outline" className="w-full" onClick={analyzeStock}>
                  <Zap className="h-4 w-4 mr-2" />
                  AI Analysis
                </Button>
                <Button variant="outline" className="w-full" onClick={() => window.open(`https://finance.yahoo.com/quote/${symbol}`, '_blank')}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  External Charts
                </Button>
              </CardContent>
            </Card>

            {/* Market Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Related Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <MarketActivityFeed 
                  isActive={true}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockDetailPage;