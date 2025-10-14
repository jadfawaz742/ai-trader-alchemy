-- Drop old constraint that uses 'low', 'medium', 'high'
ALTER TABLE user_asset_prefs DROP CONSTRAINT IF EXISTS user_asset_prefs_risk_mode_check;

-- Update existing data to match UI terminology
UPDATE user_asset_prefs SET risk_mode = 'conservative' WHERE risk_mode = 'low';
UPDATE user_asset_prefs SET risk_mode = 'aggressive' WHERE risk_mode = 'high';

-- Add new constraint with correct values matching the UI
ALTER TABLE user_asset_prefs 
ADD CONSTRAINT user_asset_prefs_risk_mode_check 
CHECK (risk_mode IN ('conservative', 'medium', 'aggressive'));