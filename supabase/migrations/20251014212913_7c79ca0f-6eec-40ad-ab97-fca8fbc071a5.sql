-- Enable global trading
UPDATE feature_flags 
SET enabled = true 
WHERE key = 'trading_enabled_global';

-- Create placeholder models for BTCUSDT and ETHUSDT
-- These will be replaced when you train actual models
INSERT INTO models (asset, version, status, location, model_type, metadata)
VALUES 
  ('BTCUSDT', 'v1.0', 'active', 'placeholder', 'ppo', '{"description": "Initial BTC model", "placeholder": true}'),
  ('ETHUSDT', 'v1.0', 'active', 'placeholder', 'ppo', '{"description": "Initial ETH model", "placeholder": true}')
ON CONFLICT DO NOTHING;

-- Get the Binance broker ID
DO $$
DECLARE
  binance_broker_id uuid;
  current_user_id uuid;
BEGIN
  -- Get Binance broker ID
  SELECT id INTO binance_broker_id FROM brokers WHERE name = 'Binance' LIMIT 1;
  
  -- Get current authenticated user (you'll need to be logged in when this runs)
  -- For now, we'll insert for any user who has a Binance connection
  FOR current_user_id IN 
    SELECT DISTINCT user_id FROM broker_connections WHERE broker_id = binance_broker_id
  LOOP
    -- Insert default asset preferences for BTCUSDT and ETHUSDT
    INSERT INTO user_asset_prefs (user_id, asset, broker_id, enabled, max_exposure_usd, risk_mode)
    VALUES 
      (current_user_id, 'BTCUSDT', binance_broker_id, true, 100, 'medium'),
      (current_user_id, 'ETHUSDT', binance_broker_id, true, 50, 'medium')
    ON CONFLICT (user_id, asset, broker_id) DO UPDATE
    SET enabled = true,
        max_exposure_usd = EXCLUDED.max_exposure_usd,
        risk_mode = EXCLUDED.risk_mode,
        updated_at = now();
  END LOOP;
END $$;

-- Insert initial model metrics
INSERT INTO model_metrics (asset, version, total_trades, profitable_trades, win_rate, avg_rr, sharpe, max_dd)
VALUES 
  ('BTCUSDT', 'v1.0', 0, 0, 0.0, 0.0, 0.0, 0.0),
  ('ETHUSDT', 'v1.0', 0, 0, 0.0, 0.0, 0.0, 0.0)
ON CONFLICT DO NOTHING;