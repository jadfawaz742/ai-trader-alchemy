-- Create base_models table for the general PPO model trained on all assets
CREATE TABLE IF NOT EXISTS public.base_models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  model_type TEXT NOT NULL DEFAULT 'general_ppo',
  model_weights JSONB NOT NULL,
  training_metadata JSONB,
  performance_metrics JSONB,
  assets_trained_on TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.base_models ENABLE ROW LEVEL SECURITY;

-- RLS Policies for base_models
CREATE POLICY "Users can view their own base models"
  ON public.base_models
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own base models"
  ON public.base_models
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own base models"
  ON public.base_models
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Add base_model_id to asset_models to track which base model was used for fine-tuning
ALTER TABLE public.asset_models 
ADD COLUMN IF NOT EXISTS base_model_id UUID REFERENCES public.base_models(id);

-- Add fine_tuning_metadata to track the fine-tuning process
ALTER TABLE public.asset_models
ADD COLUMN IF NOT EXISTS fine_tuning_metadata JSONB;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_asset_models_base_model ON public.asset_models(base_model_id);
CREATE INDEX IF NOT EXISTS idx_base_models_user ON public.base_models(user_id, updated_at DESC);