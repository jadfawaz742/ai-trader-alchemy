-- First, delete duplicate rows keeping only the most recent one per user/symbol/type
DELETE FROM asset_models a
USING asset_models b
WHERE a.id < b.id 
  AND a.user_id = b.user_id 
  AND a.symbol = b.symbol 
  AND a.model_type = b.model_type;

-- Now add the unique constraint
ALTER TABLE asset_models 
ADD CONSTRAINT asset_models_user_symbol_type_unique 
UNIQUE (user_id, symbol, model_type);