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

    console.log('🤖 Inference Service: Starting cycle...');

    // Check global trading flag
    const { data: flags } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'trading_enabled')
      .single();

    if (!flags?.enabled) {
      console.log('⏸️ Trading disabled globally');
      return new Response(JSON.stringify({ status: 'paused', message: 'Trading disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch active models and enabled user preferences
    const { data: activeModels } = await supabase
      .from('models')
      .select('asset, version, location, metadata')
      .eq('status', 'active');

    const { data: userPrefs } = await supabase
      .from('user_asset_prefs')
      .select(`
        user_id,
        asset,
        enabled,
        max_exposure_usd,
        risk_mode,
        broker_id,
        broker_connections!inner(status, encrypted_credentials)
      `)
      .eq('enabled', true)
      .eq('broker_connections.status', 'active');

    if (!userPrefs || userPrefs.length === 0) {
      console.log('ℹ️ No active user preferences found');
      return new Response(JSON.stringify({ 
        status: 'success', 
        signals: 0,
        message: 'No active users/assets' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📊 Processing ${userPrefs.length} user-asset combinations...`);

    let signalsGenerated = 0;
    const signalResults = [];

    // Group by user for batch processing
    const userAssetMap = new Map<string, typeof userPrefs>();
    for (const pref of userPrefs) {
      if (!userAssetMap.has(pref.user_id)) {
        userAssetMap.set(pref.user_id, []);
      }
      userAssetMap.get(pref.user_id)!.push(pref);
    }

    // Process each user's assets
    for (const [userId, assets] of userAssetMap.entries()) {
      console.log(`👤 Processing user ${userId} with ${assets.length} assets...`);

      // Call generate-signals for this user
      const { data: signalsData, error: signalsError } = await supabase.functions.invoke('generate-signals', {
        body: {
          user_id: userId,
          assets: assets.map(a => ({
            asset: a.asset,
            broker_id: a.broker_id,
            max_exposure_usd: a.max_exposure_usd,
            risk_mode: a.risk_mode
          }))
        }
      });

      if (signalsError) {
        console.error(`❌ Error generating signals for user ${userId}:`, signalsError);
        continue;
      }

      const signals = signalsData?.signals || [];
      console.log(`✅ Generated ${signals.length} signals for user ${userId}`);

      // Execute signals via execute-signal function
      for (const signal of signals) {
        try {
          const { data: execResult, error: execError } = await supabase.functions.invoke('execute-signal', {
            body: { signal_id: signal.id }
          });

          if (execError) {
            console.error(`❌ Failed to execute signal ${signal.id}:`, execError);
            signalResults.push({ signal_id: signal.id, status: 'failed', error: execError.message });
          } else {
            signalsGenerated++;
            signalResults.push({ signal_id: signal.id, status: 'executed', result: execResult });
            console.log(`✅ Executed signal ${signal.id} for ${signal.asset}`);
          }
        } catch (error) {
          console.error(`❌ Exception executing signal:`, error);
          signalResults.push({ signal_id: signal.id, status: 'error', error: error.message });
        }
      }
    }

    // Log cycle to cron_job_history
    await supabase.from('cron_job_history').insert({
      job_name: 'inference-service',
      status: 'completed',
      details: {
        users_processed: userAssetMap.size,
        signals_generated: signalsGenerated,
        results: signalResults
      }
    });

    console.log(`✅ Inference cycle complete: ${signalsGenerated} signals executed`);

    return new Response(JSON.stringify({
      status: 'success',
      users_processed: userAssetMap.size,
      signals_generated: signalsGenerated,
      results: signalResults
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Inference service error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      status: 'error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
