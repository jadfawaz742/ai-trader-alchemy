import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Search, TrendingUp, TrendingDown, AlertCircle, Newspaper } from "lucide-react";
import NewsWidget from "./NewsWidget";

interface Analysis {
  id: string;
  symbol: string;
  company_name: string;
  llm_analysis: string;
  recommendation: string;
  confidence_score: number;
  sentiment_score: number;
  analysis_type: string;
  created_at: string;
  market_data: any;
}

const StockAnalyzer = () => {
  const [symbol, setSymbol] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentStock, setCurrentStock] = useState<{symbol: string, company: string} | null>(null);

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

      console.log("Analysis response:", data);
      
      if (data.success && data.analysis) {
        setAnalysis(data.analysis);
        setCurrentStock({
          symbol: symbol.toUpperCase(),
          company: data.analysis.company_name || `${symbol.toUpperCase()} Corporation`
        });
        toast({
          title: "Analysis Complete",
          description: `Successfully analyzed ${symbol.toUpperCase()} with news sentiment integration`,
        });
      } else {
        throw new Error(data.error || "Analysis failed");
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

  return (
    <div className="w-full space-y-6">
      <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-400" />
            AI Stock Analysis with News Integration
          </CardTitle>
          <CardDescription className="text-gray-400">
            Enter a stock symbol for AI-powered analysis that includes real-time news sentiment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Enter stock symbol (e.g., AAPL, TSLA, NVDA)"
              className="flex-1 bg-slate-800 border-slate-700 text-white"
              onKeyPress={(e) => e.key === 'Enter' && analyzeStock()}
            />
            <Button 
              onClick={analyzeStock} 
              disabled={loading || !symbol.trim()}
              className="min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Analyze
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {analysis && (
            <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-400" />
                    AI Analysis Results for {analysis.symbol}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge 
                      variant={analysis.recommendation === 'BUY' ? 'default' : 
                              analysis.recommendation === 'SELL' ? 'destructive' : 'secondary'}
                      className="text-sm"
                    >
                      {analysis.recommendation}
                    </Badge>
                    <Badge variant="outline" className="text-sm">
                      {analysis.confidence_score}% Confidence
                    </Badge>
                  </div>
                </div>
                <CardDescription className="text-gray-400">
                  Comprehensive analysis including news sentiment and market data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-white">Market Metrics</h4>
                      <div className="space-y-1 text-sm text-gray-300">
                        <div className="flex justify-between">
                          <span>Company:</span>
                          <span className="text-white">{analysis.company_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Analysis Type:</span>
                          <span className="text-white capitalize">{analysis.analysis_type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sentiment Score:</span>
                          <span className={`font-medium ${
                            analysis.sentiment_score > 60 ? 'text-green-400' : 
                            analysis.sentiment_score < 40 ? 'text-red-400' : 'text-yellow-400'
                          }`}>
                            {analysis.sentiment_score}/100
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-white">News Integration</h4>
                      <div className="space-y-1 text-sm text-gray-300">
                        <div className="flex items-center gap-2">
                          <Newspaper className="h-4 w-4 text-blue-400" />
                          <span>Real-time news analyzed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-400" />
                          <span>Sentiment impact: {
                            analysis.sentiment_score > 60 ? 'Positive' : 
                            analysis.sentiment_score < 40 ? 'Negative' : 'Neutral'
                          }</span>
                        </div>
                        <div className="text-xs text-gray-400">
                          Analysis updated: {new Date(analysis.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-white">AI Analysis Report</h4>
                    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-lg p-6 border border-slate-600 shadow-xl">
                      <div className="prose prose-invert max-w-none">
                        <div className="text-gray-200 leading-relaxed whitespace-pre-wrap font-sans text-sm">
                          {analysis.llm_analysis}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <AlertCircle className="h-3 w-3" />
                    <span>This analysis integrates real-time news sentiment with market data for comprehensive insights</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!analysis && !loading && (
            <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-sm">
              <CardContent className="p-12 text-center">
                <TrendingUp className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Ready for Analysis</h3>
                <p className="text-gray-400">
                  Enter a stock symbol above to get AI-powered analysis with real-time news integration
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <NewsWidget 
            symbol={currentStock?.symbol} 
            company={currentStock?.company}
          />
        </div>
      </div>
    </div>
  );
};

export default StockAnalyzer;