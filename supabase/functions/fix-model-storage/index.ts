import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log('🔧 Starting model storage fix...');

    // User and model details
    const userId = 'f53fd650-b4f4-45ad-8c9b-7568c884cb6b';
    const modelId = '4fe18e45-dbdf-4de2-8d58-d481afc7806c';
    const symbol = 'BTCUSDT';
    const version = 1;

    // Define paths
    const oldModelPath = 'final_model.json';
    const oldMetadataPath = 'model_metadata.json';
    const newModelPath = `models/${userId}/BTCUSDT/v${version}/final_model.json`;
    const newMetadataPath = `models/${userId}/BTCUSDT/v${version}/model_metadata.json`;

    console.log(`📥 Downloading files from root storage...`);

    // Download model file
    const { data: modelData, error: modelDownloadError } = await supabaseClient
      .storage
      .from('trained-models')
      .download(oldModelPath);

    if (modelDownloadError) {
      throw new Error(`Failed to download model: ${modelDownloadError.message}`);
    }

    console.log(`✅ Downloaded model (${modelData.size} bytes)`);

    // Download metadata file
    const { data: metadataData, error: metadataDownloadError } = await supabaseClient
      .storage
      .from('trained-models')
      .download(oldMetadataPath);

    if (metadataDownloadError) {
      throw new Error(`Failed to download metadata: ${metadataDownloadError.message}`);
    }

    console.log(`✅ Downloaded metadata (${metadataData.size} bytes)`);

    // Upload to new paths
    console.log(`📤 Uploading to correct paths...`);

    const { error: modelUploadError } = await supabaseClient
      .storage
      .from('trained-models')
      .upload(newModelPath, modelData, {
        contentType: 'application/json',
        upsert: true
      });

    if (modelUploadError) {
      throw new Error(`Failed to upload model: ${modelUploadError.message}`);
    }

    console.log(`✅ Uploaded model to ${newModelPath}`);

    const { error: metadataUploadError } = await supabaseClient
      .storage
      .from('trained-models')
      .upload(newMetadataPath, metadataData, {
        contentType: 'application/json',
        upsert: true
      });

    if (metadataUploadError) {
      throw new Error(`Failed to upload metadata: ${metadataUploadError.message}`);
    }

    console.log(`✅ Uploaded metadata to ${newMetadataPath}`);

    // Update database record
    console.log(`💾 Updating database record...`);

    const { error: updateError } = await supabaseClient
      .from('asset_models')
      .update({
        model_storage_path: newModelPath,
        metadata_storage_path: newMetadataPath,
        updated_at: new Date().toISOString()
      })
      .eq('id', modelId);

    if (updateError) {
      throw new Error(`Failed to update database: ${updateError.message}`);
    }

    console.log(`✅ Updated asset_models record`);

    // Clean up old files
    console.log(`🧹 Cleaning up old files...`);

    const { error: deleteError } = await supabaseClient
      .storage
      .from('trained-models')
      .remove([oldModelPath, oldMetadataPath]);

    if (deleteError) {
      console.warn(`⚠️ Failed to delete old files: ${deleteError.message}`);
      // Don't throw - this is non-critical
    } else {
      console.log(`✅ Deleted old files from root`);
    }

    // Verify the fix
    console.log(`🔍 Verifying fix...`);

    const { data: verifyModel } = await supabaseClient
      .storage
      .from('trained-models')
      .list(`models/${userId}/BTCUSDT/v${version}`);

    const { data: verifyDb } = await supabaseClient
      .from('asset_models')
      .select('model_storage_path, metadata_storage_path')
      .eq('id', modelId)
      .single();

    console.log(`✅ Storage files:`, verifyModel?.map(f => f.name));
    console.log(`✅ Database paths:`, verifyDb);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Model storage fixed successfully',
        oldPaths: {
          model: oldModelPath,
          metadata: oldMetadataPath
        },
        newPaths: {
          model: newModelPath,
          metadata: newMetadataPath
        },
        verification: {
          storageFiles: verifyModel?.map(f => f.name) || [],
          databasePaths: verifyDb
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ Error fixing model storage:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
