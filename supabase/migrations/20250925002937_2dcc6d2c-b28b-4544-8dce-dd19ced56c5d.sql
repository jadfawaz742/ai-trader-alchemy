-- Create tables for storing bot learning data and trade history
CREATE TABLE IF NOT EXISTS public.trading_bot_learning (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  trade_action TEXT NOT NULL, -- BUY, SELL, HOLD
  entry_price DECIMAL(10,4),
  exit_price DECIMAL(10,4),
  stop_loss DECIMAL(10,4),
  take_profit DECIMAL(10,4),
  confidence_level DECIMAL(5,2),
  confluence_score DECIMAL(5,2),
  risk_level TEXT,
  outcome TEXT, -- WIN, LOSS, NEUTRAL
  profit_loss DECIMAL(10,4),
  trade_duration_hours INTEGER,
  market_condition TEXT,
  indicators JSONB,
  reasoning TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trading_bot_learning ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own trading bot learning data" 
ON public.trading_bot_learning 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own trading bot learning data" 
ON public.trading_bot_learning 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trading bot learning data" 
ON public.trading_bot_learning 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_trading_bot_learning_user_symbol ON public.trading_bot_learning(user_id, symbol);
CREATE INDEX idx_trading_bot_learning_outcome ON public.trading_bot_learning(user_id, outcome);
CREATE INDEX idx_trading_bot_learning_created ON public.trading_bot_learning(created_at);

-- Create adaptive learning parameters table
CREATE TABLE IF NOT EXISTS public.bot_adaptive_parameters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  confidence_threshold DECIMAL(5,2) DEFAULT 75.0,
  confluence_threshold DECIMAL(5,2) DEFAULT 0.6,
  stop_loss_multiplier DECIMAL(5,2) DEFAULT 1.0,
  take_profit_multiplier DECIMAL(5,2) DEFAULT 1.0,
  success_rate DECIMAL(5,2) DEFAULT 0.0,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  average_profit DECIMAL(10,4) DEFAULT 0.0,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);

-- Enable RLS
ALTER TABLE public.bot_adaptive_parameters ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own bot parameters" 
ON public.bot_adaptive_parameters 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bot parameters" 
ON public.bot_adaptive_parameters 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bot parameters" 
ON public.bot_adaptive_parameters 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bot parameters" 
ON public.bot_adaptive_parameters 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_trading_bot_learning_updated_at
BEFORE UPDATE ON public.trading_bot_learning
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bot_adaptive_parameters_updated_at
BEFORE UPDATE ON public.bot_adaptive_parameters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();