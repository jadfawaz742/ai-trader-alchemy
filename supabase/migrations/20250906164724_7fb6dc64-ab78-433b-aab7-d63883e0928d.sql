-- Create portfolios table for user portfolios
CREATE TABLE public.portfolios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Portfolio',
  initial_balance DECIMAL(15,2) NOT NULL DEFAULT 100000.00,
  current_balance DECIMAL(15,2) NOT NULL DEFAULT 100000.00,
  total_pnl DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create positions table for tracking stock positions
CREATE TABLE public.positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  average_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  current_price DECIMAL(10,2) DEFAULT 0.00,
  total_cost DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  current_value DECIMAL(15,2) DEFAULT 0.00,
  unrealized_pnl DECIMAL(15,2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(portfolio_id, symbol)
);

-- Create trades table for tracking all trading activity
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY', 'SELL')),
  quantity INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(15,2) NOT NULL,
  ppo_signal JSONB,
  risk_score DECIMAL(5,2),
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create risk_parameters table for PPO and risk management settings
CREATE TABLE public.risk_parameters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  max_position_size DECIMAL(5,2) NOT NULL DEFAULT 10.00, -- Max % of portfolio per position
  ppo_fast_period INTEGER NOT NULL DEFAULT 12,
  ppo_slow_period INTEGER NOT NULL DEFAULT 26,
  ppo_signal_period INTEGER NOT NULL DEFAULT 9,
  ppo_buy_threshold DECIMAL(5,2) NOT NULL DEFAULT 0.50,
  ppo_sell_threshold DECIMAL(5,2) NOT NULL DEFAULT -0.50,
  stop_loss_percent DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  take_profit_percent DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(portfolio_id)
);

-- Enable RLS on all tables
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_parameters ENABLE ROW LEVEL SECURITY;

-- Create policies for user access (public access for demo)
CREATE POLICY "Allow all operations on portfolios" ON public.portfolios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on positions" ON public.positions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on trades" ON public.trades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on risk_parameters" ON public.risk_parameters FOR ALL USING (true) WITH CHECK (true);

-- Add triggers for automatic timestamp updates
CREATE TRIGGER update_portfolios_updated_at
  BEFORE UPDATE ON public.portfolios
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_risk_parameters_updated_at
  BEFORE UPDATE ON public.risk_parameters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert a default demo portfolio
INSERT INTO public.portfolios (name, initial_balance, current_balance)
VALUES ('Demo Trading Portfolio', 100000.00, 100000.00);

-- Insert default risk parameters for the demo portfolio
INSERT INTO public.risk_parameters (portfolio_id, max_position_size, ppo_fast_period, ppo_slow_period, ppo_signal_period)
SELECT id, 10.00, 12, 26, 9 FROM public.portfolios WHERE name = 'Demo Trading Portfolio';