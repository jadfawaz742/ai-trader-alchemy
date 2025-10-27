-- Drop old foreign key constraint that references models table
ALTER TABLE signals 
DROP CONSTRAINT IF EXISTS signals_model_id_fkey;

-- Add new foreign key constraint to reference asset_models table
ALTER TABLE signals 
ADD CONSTRAINT signals_model_id_fkey 
FOREIGN KEY (model_id) 
REFERENCES asset_models(id) 
ON DELETE SET NULL;