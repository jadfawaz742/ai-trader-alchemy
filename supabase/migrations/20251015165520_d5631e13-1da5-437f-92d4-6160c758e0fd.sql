-- =====================================================
-- CRITICAL FIX: Populate broker_assets and symbol_map
-- Required for trade execution and quantity calculations
-- =====================================================

-- Get Binance broker ID
DO $$
DECLARE
  binance_id UUID;
BEGIN
  SELECT id INTO binance_id FROM brokers WHERE name = 'Binance' LIMIT 1;
  
  IF binance_id IS NULL THEN
    RAISE EXCEPTION 'Binance broker not found in brokers table';
  END IF;
  
  RAISE NOTICE 'Found Binance broker ID: %', binance_id;
  
  -- =====================================================
  -- Populate broker_assets with trading constraints
  -- =====================================================
  
  -- Insert broker_assets for all USDT pairs from batch_training_jobs
  INSERT INTO broker_assets (
    broker_id, 
    asset, 
    broker_symbol, 
    min_qty, 
    step_size, 
    tick_size, 
    min_notional
  )
  SELECT 
    binance_id,
    symbol as asset,
    symbol as broker_symbol,
    CASE 
      -- BTC has larger minimum
      WHEN symbol = 'BTCUSDT' THEN 0.00001
      -- ETH and other large caps
      WHEN symbol IN ('ETHUSDT', 'BNBUSDT', 'SOLUSDT') THEN 0.0001
      -- Most altcoins
      ELSE 0.001
    END as min_qty,
    CASE 
      WHEN symbol = 'BTCUSDT' THEN 0.00001
      WHEN symbol IN ('ETHUSDT', 'BNBUSDT', 'SOLUSDT') THEN 0.0001
      ELSE 0.001
    END as step_size,
    0.01 as tick_size,    -- $0.01 price precision for most pairs
    10.0 as min_notional  -- $10 minimum trade size
  FROM (
    SELECT DISTINCT symbol 
    FROM batch_training_jobs
    WHERE symbol LIKE '%USDT'
  ) assets
  ON CONFLICT (broker_id, asset) 
  DO UPDATE SET
    min_qty = EXCLUDED.min_qty,
    step_size = EXCLUDED.step_size,
    tick_size = EXCLUDED.tick_size,
    min_notional = EXCLUDED.min_notional,
    updated_at = now();
  
  RAISE NOTICE 'Populated broker_assets for % USDT pairs', 
    (SELECT COUNT(*) FROM broker_assets WHERE broker_id = binance_id);
  
  -- =====================================================
  -- Populate symbol_map for asset to broker symbol mapping
  -- =====================================================
  
  INSERT INTO symbol_map (
    asset, 
    broker_id, 
    broker_symbol
  )
  SELECT 
    symbol as asset,
    binance_id,
    symbol as broker_symbol  -- Binance uses same symbol format
  FROM (
    SELECT DISTINCT symbol 
    FROM batch_training_jobs
    WHERE symbol LIKE '%USDT'
  ) assets
  ON CONFLICT (asset, broker_id) 
  DO UPDATE SET
    broker_symbol = EXCLUDED.broker_symbol;
  
  RAISE NOTICE 'Populated symbol_map for % USDT pairs', 
    (SELECT COUNT(*) FROM symbol_map WHERE broker_id = binance_id);
    
END $$;