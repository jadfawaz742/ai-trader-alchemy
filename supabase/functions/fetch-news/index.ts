import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const fmpApiKey = Deno.env.get('BcRIbmG53ng386EskNaLED4kG5VTYUtE');

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
    
    if (!fmpApiKey) {
      throw new Error('FMP_API_KEY is not configured');
    }

    console.log(`Fetching news for ${symbol} (${company})`);
    console.log(`FMP API Key exists: ${!!fmpApiKey}, length: ${fmpApiKey?.length || 0}`);

    // Fetch news from Financial Modeling Prep
    const newsUrl = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${symbol}&limit=10&apikey=${fmpApiKey}`;
    console.log(`Fetching from FMP: ${newsUrl.replace(fmpApiKey || '', 'API_KEY_HIDDEN')}`);
    
    const newsResponse = await fetch(newsUrl);

    console.log(`FMP API Response Status: ${newsResponse.status} ${newsResponse.statusText}`);

    if (!newsResponse.ok) {
      const errorBody = await newsResponse.text();
      console.error(`FMP API error response body: ${errorBody}`);
      throw new Error(`FMP API error: ${newsResponse.status} - ${errorBody}`);
    }

    const newsData = await newsResponse.json();
    
    // Format news articles from FMP
    const relevantNews = newsData
      ?.filter((article: any) => 
        article.title && 
        article.text && 
        article.publishedDate
      )
      .slice(0, 5)
      .map((article: any) => ({
        title: article.title,
        description: article.text,
        url: article.url,
        source: article.site || 'Financial Modeling Prep',
        publishedAt: article.publishedDate,
        sentiment: analyzeSentiment(article.title + ' ' + article.text)
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