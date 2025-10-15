-- Step 1: Create storage bucket for trained models
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trained-models', 
  'trained-models', 
  false,
  52428800,
  ARRAY['application/json']
);

-- RLS Policy: Users can upload their own models
CREATE POLICY "Users can upload their own models"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trained-models' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS Policy: Users can read their own models
CREATE POLICY "Users can read their own models"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'trained-models' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS Policy: Users can update/delete their own models
CREATE POLICY "Users can update their own models"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'trained-models' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own models"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'trained-models' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS Policy: Service role can manage all models
CREATE POLICY "Service role can manage all models"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'trained-models');

-- Step 2: Update database schema for storage paths
ALTER TABLE asset_models 
ADD COLUMN IF NOT EXISTS model_storage_path TEXT,
ADD COLUMN IF NOT EXISTS metadata_storage_path TEXT,
ADD COLUMN IF NOT EXISTS model_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS model_status TEXT DEFAULT 'active' 
  CHECK (model_status IN ('active', 'shadow', 'archived', 'failed'));

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_asset_models_storage 
ON asset_models(user_id, symbol, model_status, created_at DESC);

-- Add unique constraint to prevent duplicate active models per user/symbol
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_models_active_unique
ON asset_models(user_id, symbol)
WHERE model_status = 'active';

-- Add comments for clarity
COMMENT ON COLUMN asset_models.model_storage_path IS 'Path to model weights JSON in trained-models bucket';
COMMENT ON COLUMN asset_models.metadata_storage_path IS 'Path to training metadata JSON in trained-models bucket';