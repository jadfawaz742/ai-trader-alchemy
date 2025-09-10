-- Reset all portfolio data to create fresh accounts
UPDATE public.portfolios 
SET current_balance = initial_balance, 
    total_pnl = 0.00;

-- Clear all positions
DELETE FROM public.positions;

-- Clear all trades  
DELETE FROM public.trades;

-- Clear all stock analysis
DELETE FROM public.stock_analysis;

-- Clear all market data
DELETE FROM public.market_data;