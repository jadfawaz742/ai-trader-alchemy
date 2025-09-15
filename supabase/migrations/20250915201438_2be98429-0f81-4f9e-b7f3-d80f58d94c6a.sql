-- Enable auto trading for existing risk parameters
UPDATE risk_parameters 
SET auto_trading_enabled = true 
WHERE auto_trading_enabled = false;