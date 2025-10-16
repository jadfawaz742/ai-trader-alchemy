import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PendingModel {
  id: string;
  symbol: string;
  user_id: string;
  created_at: string;
  training_data_points: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔍 Checking for models pending validation...');

    // Find models with status 'pending_validation', limit to 5 per run
    const { data: pendingModels, error: queryError } = await supabase
      .from('asset_models')
      .select('id, symbol, user_id, created_at, training_data_points')
      .eq('model_status', 'pending_validation')
      .order('created_at', { ascending: true })
      .limit(5);

    if (queryError) {
      throw new Error(`Failed to query pending models: ${queryError.message}`);
    }

    if (!pendingModels || pendingModels.length === 0) {
      console.log('✅ No models pending validation');
      return new Response(JSON.stringify({
        success: true,
        message: 'No models pending validation',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📋 Found ${pendingModels.length} models pending validation`);

    const results = [];
    
    for (const model of pendingModels as PendingModel[]) {
      console.log(`🔄 Validating ${model.symbol} (ID: ${model.id})...`);
      
      try {
        // Calculate date range for validation (last 12 months)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 12);

        // Call validate-model function
        const { data: validationResult, error: validationError } = await supabase.functions.invoke(
          'validate-model',
          {
            body: {
              modelId: model.id,
              asset: model.symbol,
              startDate: startDate.toISOString().split('T')[0],
              endDate: endDate.toISOString().split('T')[0],
              config: {
                trainMonths: 6,
                testMonths: 2,
                minWinRate: 0.52,
                minSharpe: 0.8,
                maxDrawdown: 0.20,
                requiredPassRate: 0.60
              }
            }
          }
        );

        if (validationError) {
          console.error(`❌ Validation failed for ${model.symbol}:`, validationError);
          
          // Mark model as failed_validation
          await supabase
            .from('asset_models')
            .update({ 
              model_status: 'failed_validation',
              performance_metrics: {
                validation_error: validationError.message,
                validation_attempted_at: new Date().toISOString()
              }
            })
            .eq('id', model.id);

          results.push({
            symbol: model.symbol,
            success: false,
            error: validationError.message
          });
          continue;
        }

        console.log(`✅ Validation complete for ${model.symbol}: ${validationResult?.approved ? 'APPROVED' : 'REJECTED'}`);
        
        results.push({
          symbol: model.symbol,
          success: true,
          approved: validationResult?.approved || false
        });

        // Log to audit
        await supabase
          .from('service_role_audit')
          .insert({
            function_name: 'validate-pending-models',
            action: 'model_validated',
            user_id: model.user_id,
            metadata: {
              model_id: model.id,
              symbol: model.symbol,
              approved: validationResult?.approved || false
            }
          });

      } catch (error) {
        console.error(`❌ Error validating ${model.symbol}:`, error);
        results.push({
          symbol: model.symbol,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log(`✅ Validation batch complete. Processed ${results.length} models`);

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Validation batch error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
