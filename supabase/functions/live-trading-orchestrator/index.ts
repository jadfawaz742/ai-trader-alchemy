import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserAssetPref {
  asset: string;
  enabled: boolean;
  max_exposure_usd: number;
  risk_mode: string;
  broker_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🎯 Starting live trading orchestration cycle...');

    // 1. Check if trading is globally enabled
    const { data: tradingFlag } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'trading_enabled')
      .single();

    if (!tradingFlag?.enabled) {
      console.log('⏸️ Trading is globally disabled');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Trading paused globally',
        executed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Get all active models
    const { data: activeModels } = await supabase
      .from('models')
      .select('asset')
      .eq('status', 'active');

    if (!activeModels || activeModels.length === 0) {
      console.log('⚠️ No active models found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No active models',
        executed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const activeAssets = activeModels.map(m => m.asset);
    console.log(`📊 Found ${activeAssets.length} active assets:`, activeAssets);

    // 3. Get all user asset preferences that are enabled
    const { data: userPrefs } = await supabase
      .from('user_asset_prefs')
      .select('*, broker_connections!inner(*)')
      .eq('enabled', true)
      .in('asset', activeAssets)
      .eq('broker_connections.status', 'active');

    if (!userPrefs || userPrefs.length === 0) {
      console.log('⚠️ No enabled user asset preferences found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No enabled assets for any users',
        executed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`👥 Found ${userPrefs.length} enabled user-asset combinations`);

    // 4. For each user, generate signals for their enabled assets
    const userAssetMap = new Map<string, UserAssetPref[]>();
    userPrefs.forEach(pref => {
      const userId = (pref as any).broker_connections.user_id;
      if (!userAssetMap.has(userId)) {
        userAssetMap.set(userId, []);
      }
      userAssetMap.get(userId)!.push({
        asset: pref.asset,
        enabled: pref.enabled,
        max_exposure_usd: pref.max_exposure_usd,
        risk_mode: pref.risk_mode,
        broker_id: pref.broker_id
      });
    });

    let totalSignalsGenerated = 0;
    let totalTradesExecuted = 0;

    // 5. Generate signals for each user
    for (const [userId, prefs] of userAssetMap.entries()) {
      try {
        const enabledAssets = prefs.filter(p => p.enabled).map(p => p.asset);
        if (enabledAssets.length === 0) continue;

        console.log(`\n🔍 Generating signals for user ${userId} with ${enabledAssets.length} assets...`);

        // Call generate-signals edge function
        const { data: signalsData, error: signalsError } = await supabase.functions.invoke('generate-signals', {
          body: { 
            assets: enabledAssets,
            userId,
            mode: 'live'
          }
        });

        if (signalsError) {
          console.error(`❌ Error generating signals for user ${userId}:`, signalsError);
          continue;
        }

        if (!signalsData?.signals || signalsData.signals.length === 0) {
          console.log(`ℹ️ No signals generated for user ${userId}`);
          continue;
        }

        console.log(`✅ Generated ${signalsData.signals.length} signals for user ${userId}`);
        totalSignalsGenerated += signalsData.signals.length;

        // 6. Execute each signal
        for (const signal of signalsData.signals) {
          try {
            // Find the preference for this asset
            const assetPref = prefs.find(p => p.asset === signal.asset);
            if (!assetPref) continue;

            // Calculate position size based on max exposure
            const positionSize = Math.min(
              signal.qty || 0,
              assetPref.max_exposure_usd / (signal.price || 1)
            );

            if (positionSize === 0) {
              console.log(`⚠️ Skipping ${signal.asset}: position size is 0`);
              continue;
            }

            console.log(`📤 Executing ${signal.side} ${positionSize} ${signal.asset} @ $${signal.price}`);

            // Call execute-signal edge function
            const { data: execData, error: execError } = await supabase.functions.invoke('execute-signal', {
              body: {
                signalId: signal.id,
                userId,
                brokerId: assetPref.broker_id
              }
            });

            if (execError) {
              console.error(`❌ Error executing signal ${signal.id}:`, execError);
              continue;
            }

            if (execData?.success) {
              console.log(`✅ Trade executed successfully: ${signal.side} ${positionSize} ${signal.asset}`);
              totalTradesExecuted++;
            } else {
              console.log(`⚠️ Trade execution failed: ${execData?.message || 'Unknown error'}`);
            }

          } catch (signalError) {
            console.error(`❌ Error processing signal:`, signalError);
          }
        }

      } catch (userError) {
        console.error(`❌ Error processing user ${userId}:`, userError);
      }
    }

    // 7. Log orchestration cycle
    await supabase.from('cron_job_history').insert({
      job_name: 'live-trading-orchestrator',
      status: 'success',
      details: {
        signals_generated: totalSignalsGenerated,
        trades_executed: totalTradesExecuted,
        users_processed: userAssetMap.size
      }
    });

    console.log(`\n📊 Orchestration cycle complete:`);
    console.log(`   - Users processed: ${userAssetMap.size}`);
    console.log(`   - Signals generated: ${totalSignalsGenerated}`);
    console.log(`   - Trades executed: ${totalTradesExecuted}`);

    return new Response(JSON.stringify({
      success: true,
      users_processed: userAssetMap.size,
      signals_generated: totalSignalsGenerated,
      trades_executed: totalTradesExecuted
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Orchestrator error:', error);
    
    // Log failure
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await supabase.from('cron_job_history').insert({
        job_name: 'live-trading-orchestrator',
        status: 'failed',
        error_message: error.message
      });
    } catch {}

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
