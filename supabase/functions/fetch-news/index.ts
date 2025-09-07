import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const newsApiKey = Deno.env.get('NEWS_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, company } = await req.json();
    
    if (!newsApiKey) {
      throw new Error('NEWS_API_KEY is not configured');
    }

    console.log(`Fetching news for ${symbol} (${company})`);

    // Fetch news from NewsAPI
    const newsResponse = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(company || symbol)}&sortBy=publishedAt&pageSize=10&apiKey=${newsApiKey}`
    );

    if (!newsResponse.ok) {
      throw new Error(`News API error: ${newsResponse.status}`);
    }

    const newsData = await newsResponse.json();
    
    // Filter and format news articles
    const relevantNews = newsData.articles
      ?.filter((article: any) => 
        article.title && 
        article.description && 
        article.publishedAt &&
        (article.title.toLowerCase().includes(symbol.toLowerCase()) ||
         article.title.toLowerCase().includes(company?.toLowerCase()) ||
         article.description.toLowerCase().includes(symbol.toLowerCase()) ||
         article.description.toLowerCase().includes(company?.toLowerCase()))
      )
      .slice(0, 5)
      .map((article: any) => ({
        title: article.title,
        description: article.description,
        url: article.url,
        source: article.source.name,
        publishedAt: article.publishedAt,
        sentiment: analyzeSentiment(article.title + ' ' + article.description)
      })) || [];

    return new Response(JSON.stringify({ 
      articles: relevantNews,
      totalResults: relevantNews.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in fetch-news function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      articles: [],
      totalResults: 0 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const positiveWords = ['gain', 'rise', 'bull', 'profit', 'growth', 'increase', 'up', 'surge', 'rally', 'boost', 'strong', 'beat', 'exceed', 'outperform'];
  const negativeWords = ['loss', 'fall', 'bear', 'decline', 'decrease', 'down', 'drop', 'crash', 'plunge', 'weak', 'miss', 'underperform', 'cut', 'lower'];
  
  const lowerText = text.toLowerCase();
  const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
  const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
  
  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}