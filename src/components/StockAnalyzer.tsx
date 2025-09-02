import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface Analysis {
  id: string;
  symbol: string;
  company_name: string;
  llm_analysis: string;
  recommendation: string;
  confidence_score: number;
  sentiment_score: number;
  created_at: string;
  market_data: any;
}

export default function StockAnalyzer() {
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<Analysis[]>([]);
  const { toast } = useToast();

  const analyzeStock = async () => {
    if (!symbol.trim()) {
      toast({
        title: "Error",
        description: "Please enter a stock symbol",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-stock', {
        body: { 
          symbol: symbol.toUpperCase(),
          analysisType: 'technical' 
        }
      });

      if (error) throw error;

      if (data.success) {
        setAnalysis(data.analysis);
        loadRecentAnalyses();
        toast({
          title: "Analysis Complete",
          description: `Successfully analyzed ${symbol.toUpperCase()}`,
        });
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error.message || 'Failed to analyze stock',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRecentAnalyses = async () => {
    try {
      const { data, error } = await supabase
        .from('stock_analysis')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentAnalyses(data || []);
    } catch (error) {
      console.error('Error loading recent analyses:', error);
    }
  };

  React.useEffect(() => {
    loadRecentAnalyses();
  }, []);

  const getSentimentIcon = (sentiment: number) => {
    if (sentiment > 0) return <TrendingUp className="h-4 w-4 text-success" />;
    if (sentiment < 0) return <TrendingDown className="h-4 w-4 text-destructive" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getSentimentLabel = (sentiment: number) => {
    if (sentiment > 0) return 'Bullish';
    if (sentiment < 0) return 'Bearish';
    return 'Neutral';
  };

  const getRecommendationVariant = (recommendation: string) => {
    switch (recommendation?.toLowerCase()) {
      case 'buy': return 'default';
      case 'sell': return 'destructive';
      case 'hold': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-primary/5 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            AI Stock Market Analyzer
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Stage 1: Advanced LLM-powered stock analysis with real-time market data processing
          </p>
        </div>

        {/* Analysis Input */}
        <Card className="w-full max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Analyze Stock</CardTitle>
            <CardDescription>
              Enter a stock symbol to get AI-powered market analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex space-x-2">
              <Input
                placeholder="Enter symbol (e.g., AAPL)"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && analyzeStock()}
                className="flex-1"
              />
              <Button 
                onClick={analyzeStock} 
                disabled={loading}
                className="min-w-[100px]"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Analyze'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Analysis Result */}
        {analysis && (
          <Card className="w-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {analysis.symbol} 
                    {getSentimentIcon(analysis.sentiment_score)}
                    <Badge variant={getRecommendationVariant(analysis.recommendation)}>
                      {analysis.recommendation}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {analysis.company_name} • Confidence: {analysis.confidence_score}% • 
                    Sentiment: {getSentimentLabel(analysis.sentiment_score)}
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {new Date(analysis.created_at).toLocaleString()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Market Data */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card/50 p-3 rounded-lg">
                  <p className="text-sm text-muted-foreground">Current Price</p>
                  <p className="text-2xl font-bold">${analysis.market_data?.currentPrice?.toFixed(2)}</p>
                </div>
                <div className="bg-card/50 p-3 rounded-lg">
                  <p className="text-sm text-muted-foreground">Change</p>
                  <p className={`text-2xl font-bold ${analysis.market_data?.priceChange >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {analysis.market_data?.priceChange >= 0 ? '+' : ''}
                    ${analysis.market_data?.priceChange?.toFixed(2)}
                  </p>
                </div>
                <div className="bg-card/50 p-3 rounded-lg">
                  <p className="text-sm text-muted-foreground">Volume</p>
                  <p className="text-2xl font-bold">{analysis.market_data?.volume?.toLocaleString()}</p>
                </div>
                <div className="bg-card/50 p-3 rounded-lg">
                  <p className="text-sm text-muted-foreground">P/E Ratio</p>
                  <p className="text-2xl font-bold">{analysis.market_data?.peRatio?.toFixed(2)}</p>
                </div>
              </div>

              {/* LLM Analysis */}
              <div>
                <h3 className="text-lg font-semibold mb-3">AI Analysis</h3>
                <div className="bg-muted/50 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                    {analysis.llm_analysis}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Analyses */}
        {recentAnalyses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Analyses</CardTitle>
              <CardDescription>Latest AI stock analyses from Stage 1</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentAnalyses.map((item) => (
                  <div 
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-card/30 rounded-lg cursor-pointer hover:bg-card/50 transition-colors"
                    onClick={() => setAnalysis(item)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="font-medium">{item.symbol}</div>
                      {getSentimentIcon(item.sentiment_score)}
                      <Badge variant={getRecommendationVariant(item.recommendation)} className="text-xs">
                        {item.recommendation}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {item.confidence_score}% confidence
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}