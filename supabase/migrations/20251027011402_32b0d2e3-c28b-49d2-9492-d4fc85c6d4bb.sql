-- Update asset_models to point to actual storage paths
UPDATE asset_models 
SET 
  model_storage_path = 'trained models/final_model.pt',
  metadata_storage_path = 'trained models/model_metadata.json',
  updated_at = now()
WHERE symbol = 'BTCUSDT' 
  AND model_status = 'active';