-- Update model storage path to point to new JSON file
UPDATE asset_models 
SET model_storage_path = 'final_model.json',
    updated_at = now()
WHERE id = '4fe18e45-dbdf-4de2-8d58-d481afc7806c'
  AND user_id = 'f53fd650-b4f4-45ad-8c9b-7568c884cb6b'
  AND symbol = 'BTCUSDT'
  AND model_status = 'active';