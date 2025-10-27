import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

export interface ModelMetadata {
  id: string;
  user_id: string;
  symbol: string;
  model_storage_path: string;
  metadata_storage_path: string;
  model_version: number;
  model_status: string;
  performance_metrics: any;
  action_space: any;
  hidden_size: number;
  sequence_length: number;
  structural_features: any;
  created_at: string;
}

/**
 * Validate model structure has required PyTorch layer weights
 */
function validateModelStructure(weights: any): boolean {
  const required = [
    'shared.0.weight',
    'shared.0.bias',
    'shared.2.weight',
    'shared.2.bias',
    'actor_discrete.weight',
    'actor_discrete.bias',
    'actor_mu.weight',
    'actor_mu.bias',
    'actor_logstd',
    'critic.weight',
    'critic.bias'
  ];
  
  const presentKeys = Object.keys(weights);
  const missingKeys = required.filter(key => !presentKeys.includes(key));
  
  if (missingKeys.length > 0) {
    console.error(`❌ Missing required model parameters: ${missingKeys.join(', ')}`);
    return false;
  }
  
  console.log(`✅ Model structure validated: ${presentKeys.length} parameters found`);
  return true;
}

/**
 * Load model weights from storage bucket
 */
export async function loadModelFromStorage(
  supabaseClient: SupabaseClient,
  storagePath: string
): Promise<any> {
  console.log(`📥 Loading model from: ${storagePath}`);
  
  const { data, error } = await supabaseClient
    .storage
    .from('trained-models')
    .download(storagePath);
  
  if (error) {
    console.error(`❌ Failed to download model: ${error.message}`);
    throw new Error(`Model download failed: ${error.message}`);
  }
  
  console.log(`📦 Downloaded ${data.size} bytes, MIME: ${data.type}`);
  
  const modelJson = await data.text();
  console.log(`📄 First 200 chars: ${modelJson.substring(0, 200)}`);
  
  let modelWeights;
  try {
    modelWeights = JSON.parse(modelJson);
  } catch (parseError) {
    console.error(`❌ JSON parse error: ${parseError}`);
    throw new Error(`Failed to parse model JSON: ${parseError}`);
  }
  
  const keys = Object.keys(modelWeights);
  console.log(`🔑 Model has ${keys.length} top-level keys: ${keys.slice(0, 10).join(', ')}`);
  
  if (!validateModelStructure(modelWeights)) {
    throw new Error('Invalid model structure: missing required neural network parameters');
  }
  
  console.log(`✅ Model loaded and validated successfully`);
  return modelWeights;
}

/**
 * Get active model for a user and symbol
 */
export async function getActiveModel(
  supabaseClient: SupabaseClient,
  userId: string,
  symbol: string
): Promise<{ metadata: ModelMetadata; weights: any } | null> {
  // Fetch model metadata
  const { data: modelMetadata, error: metadataError } = await supabaseClient
    .from('asset_models')
    .select('*')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .eq('model_status', 'active')
    .single();
  
  if (metadataError || !modelMetadata) {
    console.log(`⚠️ No active model found for ${symbol}`);
    return null;
  }

  // If model_storage_path is null, try loading from model_weights (legacy support)
  if (!modelMetadata.model_storage_path && modelMetadata.model_weights) {
    console.log(`📦 Loading model from legacy JSONB storage for ${symbol}`);
    return {
      metadata: modelMetadata,
      weights: modelMetadata.model_weights
    };
  }

  if (!modelMetadata.model_storage_path) {
    console.error(`❌ Model has no storage path and no weights for ${symbol}`);
    return null;
  }
  
  // Load model weights from storage
  const weights = await loadModelFromStorage(
    supabaseClient,
    modelMetadata.model_storage_path
  );
  
  return {
    metadata: modelMetadata,
    weights
  };
}

/**
 * Load training metadata from storage
 */
export async function loadTrainingMetadata(
  supabaseClient: SupabaseClient,
  metadataPath: string
): Promise<any> {
  const { data, error } = await supabaseClient
    .storage
    .from('trained-models')
    .download(metadataPath);
  
  if (error) {
    throw new Error(`Metadata download failed: ${error.message}`);
  }
  
  const metadataJson = await data.text();
  return JSON.parse(metadataJson);
}

/**
 * Get model version history for a symbol
 */
export async function getModelVersions(
  supabaseClient: SupabaseClient,
  userId: string,
  symbol: string
): Promise<ModelMetadata[]> {
  const { data, error } = await supabaseClient
    .from('asset_models')
    .select('*')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .order('model_version', { ascending: false });
  
  if (error) {
    throw new Error(`Failed to fetch model versions: ${error.message}`);
  }
  
  return data || [];
}
