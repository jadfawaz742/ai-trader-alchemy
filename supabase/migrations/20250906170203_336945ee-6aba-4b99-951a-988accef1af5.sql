-- Update risk parameters for higher profits and better confidence
UPDATE risk_parameters 
SET 
  max_position_size = 25.00,           -- Increase from 10% to 25%
  ppo_buy_threshold = 0.20,            -- Lower threshold for easier buying (was 0.50)
  ppo_sell_threshold = -0.20,          -- Lower threshold for easier selling (was -0.50) 
  stop_loss_percent = 8.00,            -- Slightly higher stop loss (was 5%)
  take_profit_percent = 30.00          -- Much higher profit target (was 15%)
WHERE portfolio_id IS NOT NULL;

-- Add automated trading settings to risk_parameters table
ALTER TABLE risk_parameters 
ADD COLUMN IF NOT EXISTS auto_trading_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS min_confidence_score numeric DEFAULT 75.00,
ADD COLUMN IF NOT EXISTS max_daily_trades integer DEFAULT 10;