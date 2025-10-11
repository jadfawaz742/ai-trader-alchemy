import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { asset, priority = 'normal' } = await req.json();

    if (!asset) {
      return new Response(JSON.stringify({ error: 'Asset symbol required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📋 Training request for asset: ${asset} from user ${user.id}`);

    // Check if asset already has an active model
    const { data: existingModel } = await supabase
      .from('models')
      .select('id, version, status')
      .eq('asset', asset)
      .eq('status', 'active')
      .single();

    if (existingModel) {
      console.log(`ℹ️ Asset ${asset} already has active model: ${existingModel.version}`);
      return new Response(JSON.stringify({ 
        message: 'Asset already has active model',
        model: existingModel,
        training_needed: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if training is already scheduled
    const { data: scheduledRun } = await supabase
      .from('training_runs')
      .select('id, status, created_at')
      .eq('asset', asset)
      .in('status', ['scheduled', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (scheduledRun) {
      console.log(`ℹ️ Training already ${scheduledRun.status} for ${asset}`);
      return new Response(JSON.stringify({ 
        message: `Training already ${scheduledRun.status}`,
        training_run: scheduledRun,
        training_needed: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate version number (v1.0 for new assets)
    const version = 'v1.0';

    // Schedule new training run
    const { data: newTrainingRun, error: insertError } = await supabase
      .from('training_runs')
      .insert({
        asset,
        version,
        status: 'scheduled',
        metadata: {
          requested_by: user.id,
          priority,
          requested_at: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to schedule training:', insertError);
      return new Response(JSON.stringify({ 
        error: 'Failed to schedule training',
        details: insertError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`✅ Scheduled training for ${asset} - Run ID: ${newTrainingRun.id}`);

    // Optionally trigger training immediately (if you have a training worker)
    // await supabase.functions.invoke('train-asset-model', {
    //   body: { asset, training_run_id: newTrainingRun.id }
    // });

    return new Response(JSON.stringify({ 
      message: 'Training scheduled successfully',
      training_run: newTrainingRun,
      training_needed: true,
      note: 'Training will begin in the next training cycle'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Request asset training error:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
