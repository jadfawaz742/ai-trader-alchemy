-- Create table for stock analysis results
CREATE TABLE public.stock_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  company_name TEXT,
  analysis_type TEXT NOT NULL DEFAULT 'technical',
  llm_analysis TEXT NOT NULL,
  market_data JSONB,
  sentiment_score FLOAT,
  recommendation TEXT,
  confidence_score FLOAT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for real-time market data cache
CREATE TABLE public.market_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  current_price FLOAT,
  price_change FLOAT,
  price_change_percent FLOAT,
  volume BIGINT,
  market_cap BIGINT,
  pe_ratio FLOAT,
  raw_data JSONB,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_stock_analysis_symbol ON public.stock_analysis(symbol);
CREATE INDEX idx_stock_analysis_created_at ON public.stock_analysis(created_at DESC);
CREATE INDEX idx_market_data_symbol ON public.market_data(symbol);
CREATE INDEX idx_market_data_last_updated ON public.market_data(last_updated DESC);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_stock_analysis_updated_at
  BEFORE UPDATE ON public.stock_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security (we'll keep it simple for now)
ALTER TABLE public.stock_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since this is a trading bot)
CREATE POLICY "Allow all operations on stock_analysis" 
  ON public.stock_analysis 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Allow all operations on market_data" 
  ON public.market_data 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);