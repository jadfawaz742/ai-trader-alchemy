import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Newspaper, ExternalLink, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

interface NewsWidgetProps {
  symbol?: string;
  company?: string;
}

const NewsWidget = ({ symbol, company }: NewsWidgetProps) => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (symbol) {
      fetchNews();
    }
  }, [symbol, company]);

  const fetchNews = async () => {
    if (!symbol) return;

    setLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-news', {
        body: { symbol, company }
      });

      if (error) throw error;

      if (data?.articles && data.articles.length > 0) {
        setArticles(data.articles);
      } else {
        setArticles([]);
        toast({
          title: "No news found",
          description: `No recent news articles found for ${symbol}`,
          variant: "default"
        });
      }
    } catch (error) {
      console.error('Error fetching news:', error);
      toast({
        title: "Failed to fetch news",
        description: "Could not retrieve news articles. Please try again.",
        variant: "destructive"
      });
      setArticles([]);
    } finally {
      setLoading(false);
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="h-3 w-3" />;
      case 'negative':
        return <TrendingDown className="h-3 w-3" />;
      default:
        return <Minus className="h-3 w-3" />;
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'negative':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-blue-400" />
            <CardTitle className="text-white">Market News</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchNews}
            disabled={loading || !symbol}
            className="text-gray-400 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription className="text-gray-400">
          {symbol ? `Latest news and sentiment analysis for ${symbol}` : 'This section shows how news sentiment affects trading decisions'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-slate-700 rounded mb-2"></div>
                <div className="h-3 bg-slate-700 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        ) : articles.length > 0 ? (
          <ScrollArea className="h-80">
            <div className="space-y-4">
              {articles.map((article, index) => (
                <div key={index} className="border-b border-slate-700 pb-4 last:border-b-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-sm font-medium text-white line-clamp-2 flex-1">
                      {article.title}
                    </h4>
                    <Badge 
                      variant="outline" 
                      className={`${getSentimentColor(article.sentiment)} flex items-center gap-1 text-xs whitespace-nowrap`}
                    >
                      {getSentimentIcon(article.sentiment)}
                      {article.sentiment}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400 mb-2 line-clamp-2">
                    {article.description}
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">
                      {article.source} • {new Date(article.publishedAt).toLocaleDateString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-blue-400 hover:text-blue-300"
                      onClick={() => window.open(article.url, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8">
            <Newspaper className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">
              {symbol ? 'No news found for this stock' : 'Select a stock to view news'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NewsWidget;