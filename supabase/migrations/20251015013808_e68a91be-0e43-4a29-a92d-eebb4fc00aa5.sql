-- Remove duplicate asset_models, keeping only the newest one per user/symbol
DELETE FROM asset_models a
USING (
  SELECT MAX(created_at) as max_created, user_id, symbol 
  FROM asset_models 
  GROUP BY user_id, symbol 
  HAVING COUNT(*) > 1
) b
WHERE a.user_id = b.user_id 
  AND a.symbol = b.symbol 
  AND a.created_at < b.max_created;

-- Add unique constraint to prevent future duplicates
ALTER TABLE asset_models 
ADD CONSTRAINT asset_models_user_symbol_unique 
UNIQUE(user_id, symbol);