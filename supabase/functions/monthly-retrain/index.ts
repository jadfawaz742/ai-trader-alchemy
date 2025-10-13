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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('Starting monthly retraining job');

    const jobId = crypto.randomUUID();
    await supabaseClient.from('cron_job_history').insert({
      job_name: 'monthly_retrain',
      status: 'running',
      details: { started_at: new Date().toISOString() },
    });

    // Get all active models
    const { data: activeModels } = await supabaseClient
      .from('models')
      .select('*')
      .eq('status', 'active');

    if (!activeModels || activeModels.length === 0) {
      console.log('No active models to retrain');
      return new Response(JSON.stringify({
        status: 'success',
        message: 'No active models to retrain',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const model of activeModels) {
      console.log(`Scheduling retraining for ${model.asset}`);

      try {
        // Get current metrics
        const { data: currentMetrics } = await supabaseClient
          .from('model_metrics')
          .select('*')
          .eq('asset', model.asset)
          .eq('version', model.version)
          .single();

        // Create new training run
        const newVersion = `v${Date.now()}`;
        const { data: trainingRun, error: runError } = await supabaseClient
          .from('training_runs')
          .insert({
            asset: model.asset,
            version: newVersion,
            status: 'scheduled',
          })
          .select()
          .single();

        if (runError) {
          throw runError;
        }

        results.push({
          asset: model.asset,
          current_version: model.version,
          new_version: newVersion,
          training_run_id: trainingRun.id,
          status: 'scheduled',
        });

        console.log(`✅ Scheduled retraining for ${model.asset} (${newVersion})`);
      } catch (error) {
        console.error(`Error scheduling ${model.asset}:`, error);
        results.push({
          asset: model.asset,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    await supabaseClient.from('cron_job_history').insert({
      job_name: 'monthly_retrain',
      status: 'completed',
      details: { 
        completed_at: new Date().toISOString(),
        results 
      },
    });

    console.log(`Monthly retraining complete: ${results.length} models processed`);

    return new Response(JSON.stringify({
      status: 'success',
      models_scheduled: results.length,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in monthly-retrain:', error);
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    await supabaseClient.from('cron_job_history').insert({
      job_name: 'monthly_retrain',
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
