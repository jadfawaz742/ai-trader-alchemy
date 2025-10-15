import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, symbol, version } = await req.json();

    switch (action) {
      case 'list_versions': {
        // List all versions for a symbol
        const { data, error } = await supabaseClient
          .from('asset_models')
          .select('id, symbol, model_version, model_status, created_at, performance_metrics, model_storage_path')
          .eq('user_id', user.id)
          .eq('symbol', symbol)
          .order('model_version', { ascending: false });
        
        if (error) throw error;

        return new Response(JSON.stringify({ versions: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'rollback': {
        // Rollback to a specific version
        // Archive current active model
        await supabaseClient
          .from('asset_models')
          .update({ model_status: 'archived' })
          .eq('user_id', user.id)
          .eq('symbol', symbol)
          .eq('model_status', 'active');

        // Activate the specified version
        const { error: activateError } = await supabaseClient
          .from('asset_models')
          .update({ model_status: 'active' })
          .eq('user_id', user.id)
          .eq('symbol', symbol)
          .eq('model_version', version);

        if (activateError) throw activateError;

        return new Response(JSON.stringify({ 
          success: true,
          message: `Rolled back ${symbol} to version ${version}`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'delete_old': {
        // Delete models older than 30 days, keeping at least 3 versions
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);

        // Get models to keep (at least 3 most recent)
        const { data: modelsToKeep } = await supabaseClient
          .from('asset_models')
          .select('id')
          .eq('user_id', user.id)
          .eq('symbol', symbol)
          .order('created_at', { ascending: false })
          .limit(3);

        const keepIds = modelsToKeep?.map(m => m.id) || [];

        // Find old models
        const { data: oldModels } = await supabaseClient
          .from('asset_models')
          .select('id, model_storage_path, metadata_storage_path')
          .eq('user_id', user.id)
          .eq('symbol', symbol)
          .lt('created_at', cutoffDate.toISOString())
          .not('id', 'in', `(${keepIds.join(',')})`);

        if (!oldModels || oldModels.length === 0) {
          return new Response(JSON.stringify({ 
            deleted: 0,
            message: 'No old models to delete'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Delete from storage
        const filesToDelete: string[] = [];
        for (const model of oldModels) {
          if (model.model_storage_path) filesToDelete.push(model.model_storage_path);
          if (model.metadata_storage_path) filesToDelete.push(model.metadata_storage_path);
        }

        if (filesToDelete.length > 0) {
          await supabaseClient.storage
            .from('trained-models')
            .remove(filesToDelete);
        }

        // Delete from database
        await supabaseClient
          .from('asset_models')
          .delete()
          .in('id', oldModels.map(m => m.id));

        return new Response(JSON.stringify({ 
          deleted: oldModels.length,
          message: `Deleted ${oldModels.length} old model(s) for ${symbol}`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_storage_info': {
        // Get storage usage information
        const { data: models } = await supabaseClient
          .from('asset_models')
          .select('symbol, model_storage_path, metadata_storage_path, created_at, model_version')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        const storageInfo = {
          total_models: models?.length || 0,
          symbols: [...new Set(models?.map(m => m.symbol) || [])],
          models_by_symbol: {} as Record<string, number>
        };

        models?.forEach(model => {
          storageInfo.models_by_symbol[model.symbol] = 
            (storageInfo.models_by_symbol[model.symbol] || 0) + 1;
        });

        return new Response(JSON.stringify(storageInfo), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('Error in manage-models:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error'
    }), {
      status: error.message === 'Unauthorized' ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
