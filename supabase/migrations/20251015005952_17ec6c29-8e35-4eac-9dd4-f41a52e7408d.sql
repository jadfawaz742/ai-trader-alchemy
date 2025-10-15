-- Fix RLS for newly created tables

-- Enable RLS on structural_features_cache
ALTER TABLE structural_features_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage structural features cache"
ON structural_features_cache
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Anyone can view structural features cache"
ON structural_features_cache
FOR SELECT
USING (true);

-- Enable RLS on training_episodes
ALTER TABLE training_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage training episodes"
ON training_episodes
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Users can view episodes for their models"
ON training_episodes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM asset_models
    WHERE asset_models.id = training_episodes.model_id
    AND asset_models.user_id = auth.uid()
  )
);

-- Enable RLS on model_evaluation_metrics
ALTER TABLE model_evaluation_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage model evaluation metrics"
ON model_evaluation_metrics
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE POLICY "Users can view metrics for their models"
ON model_evaluation_metrics
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM asset_models
    WHERE asset_models.id = model_evaluation_metrics.model_id
    AND asset_models.user_id = auth.uid()
  )
);