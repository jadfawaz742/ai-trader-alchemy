-- Make model_weights nullable to support storage-based models
ALTER TABLE asset_models 
ALTER COLUMN model_weights DROP NOT NULL;

-- Add default empty JSONB for backward compatibility
ALTER TABLE asset_models 
ALTER COLUMN model_weights SET DEFAULT '{}'::jsonb;

-- Add comment explaining the dual storage approach
COMMENT ON COLUMN asset_models.model_weights IS 
'Legacy JSONB storage for model weights. New models use model_storage_path instead. NULL when model is stored in bucket.';