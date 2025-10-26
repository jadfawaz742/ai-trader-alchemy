-- Register the uploaded BTC model for testnet trading
-- First, delete the old placeholder WBTCUSDT model if it exists
DELETE FROM asset_models 
WHERE user_id = 'f53fd650-b4f4-45ad-8c9b-7568c884cb6b' 
  AND symbol IN ('WBTCUSDT', 'BTCUSDT');

-- Insert the new BTCUSDT model with proper storage paths
INSERT INTO asset_models (
  user_id,
  symbol,
  model_type,
  model_storage_path,
  metadata_storage_path,
  model_status,
  model_version,
  model_architecture,
  performance_metrics,
  action_space,
  hidden_size,
  sequence_length,
  structural_features,
  created_at,
  updated_at
) VALUES (
  'f53fd650-b4f4-45ad-8c9b-7568c884cb6b',
  'BTCUSDT',
  'recurrent_ppo',
  'f53fd650-b4f4-45ad-8c9b-7568c884cb6b/final_model.pt',
  'f53fd650-b4f4-45ad-8c9b-7568c884cb6b/model_metadata.json',
  'active',
  1,
  'recurrent_ppo',
  jsonb_build_object(
    'train', jsonb_build_object(
      'totalTrades', 1373681,
      'winRate', 37.97,
      'profitableTrades', 521845,
      'losingTrades', 851836,
      'totalReturn', 21777.94,
      'sharpeRatio', 0.0,
      'maxDrawdown', -100.0,
      'averageWin', 0.0,
      'averageLoss', 0.0,
      'dailyROI', 0.016
    ),
    'test', jsonb_build_object(
      'status', 'pending_validation',
      'note', 'Model uploaded for testnet validation - USE ONLY FOR TESTING'
    )
  ),
  jsonb_build_object(
    'size', ARRAY[0.0, 1.0],
    'sl_tight', ARRAY[0.5, 2.0],
    'direction', 3,
    'tp_offset', ARRAY[-0.5, 0.5]
  ),
  256,
  50,
  jsonb_build_object(
    'enabled', true,
    'features', ARRAY['fibonacci', 'support_resistance', 'market_structure']
  ),
  now(),
  now()
);