-- Create tables for asset-specific models and trading metrics
CREATE TABLE IF NOT EXISTS public.asset_models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  symbol TEXT NOT NULL,
  model_type TEXT NOT NULL,
  model_weights JSONB NOT NULL,
  performance_metrics JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trading_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  model_type TEXT NOT NULL,
  metrics JSONB NOT NULL,
  model_weights JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.asset_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_metrics ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own asset models" ON public.asset_models
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own asset models" ON public.asset_models
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own asset models" ON public.asset_models
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own trading metrics" ON public.trading_metrics
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trading metrics" ON public.trading_metrics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trading metrics" ON public.trading_metrics
  FOR UPDATE USING (auth.uid() = user_id);

-- Add triggers for updated_at
CREATE TRIGGER update_asset_models_updated_at
  BEFORE UPDATE ON public.asset_models
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trading_metrics_updated_at
  BEFORE UPDATE ON public.trading_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();