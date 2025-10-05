import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const marketauxApiKey = Deno.env.get('NEWS_API_KEY');

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
    
    if (!marketauxApiKey) {
      throw new Error('NEWS_API_KEY is not configured');
    }

    console.log(`Fetching news for ${symbol} (${company})`);
    console.log(`Marketaux API Key exists: ${!!marketauxApiKey}, length: ${marketauxApiKey?.length || 0}`);

    // Fetch news from Marketaux
    const newsUrl = `https://api.marketaux.com/v1/news/all?symbols=${symbol}&filter_entities=true&limit=10&api_token=${marketauxApiKey}`;
    console.log(`Fetching from Marketaux: ${newsUrl.replace(marketauxApiKey || '', 'API_KEY_HIDDEN')}`);
    
    const newsResponse = await fetch(newsUrl);

    console.log(`Marketaux API Response Status: ${newsResponse.status} ${newsResponse.statusText}`);

    if (!newsResponse.ok) {
      const errorBody = await newsResponse.text();
      console.error(`Marketaux API error response body: ${errorBody}`);
      throw new Error(`Marketaux API error: ${newsResponse.status} - ${errorBody}`);
    }

    const newsData = await newsResponse.json();
    
    // Format news articles from Marketaux
    const relevantNews = newsData?.data
      ?.filter((article: any) => 
        article.title && 
        article.description && 
        article.published_at
      )
      .slice(0, 5)
      .map((article: any) => ({
        title: article.title,
        description: article.description,
        url: article.url,
        source: article.source || 'Marketaux',
        publishedAt: article.published_at,
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
      error: error instanceof Error ? error.message : 'Unknown error occurred',
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