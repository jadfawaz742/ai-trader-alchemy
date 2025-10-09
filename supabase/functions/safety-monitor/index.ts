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

    console.log('Running safety monitoring checks');

    const alerts: any[] = [];
    const actions: any[] = [];

    // Get all active models
    const { data: activeModels } = await supabaseClient
      .from('models')
      .select('*')
      .eq('status', 'active');

    if (!activeModels || activeModels.length === 0) {
      return new Response(JSON.stringify({
        status: 'ok',
        message: 'No active models to monitor',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Safety thresholds
    const MAX_DAILY_DRAWDOWN = 0.10; // 10%
    const MIN_WIN_RATE = 0.40; // 40%
    const MAX_CONSECUTIVE_LOSSES = 5;
    const LATENCY_THRESHOLD_MS = 2000;

    for (const model of activeModels) {
      const asset = model.asset;
      
      // Check model metrics
      const { data: metrics } = await supabaseClient
        .from('model_metrics')
        .select('*')
        .eq('asset', asset)
        .eq('version', model.version)
        .single();

      if (metrics) {
        // Check drawdown
        if (metrics.max_dd > MAX_DAILY_DRAWDOWN) {
          alerts.push({
            severity: 'critical',
            asset,
            type: 'max_drawdown_breach',
            message: `Max drawdown ${(metrics.max_dd * 100).toFixed(2)}% exceeds ${(MAX_DAILY_DRAWDOWN * 100).toFixed(2)}%`,
            value: metrics.max_dd,
            threshold: MAX_DAILY_DRAWDOWN,
          });

          // Auto-pause trading for this asset
          await pauseAssetTrading(supabaseClient, asset, 'Max drawdown breach');
          actions.push({
            asset,
            action: 'pause_trading',
            reason: 'max_drawdown_breach',
          });
        }

        // Check win rate
        if (metrics.win_rate < MIN_WIN_RATE && metrics.total_trades > 20) {
          alerts.push({
            severity: 'warning',
            asset,
            type: 'low_win_rate',
            message: `Win rate ${(metrics.win_rate * 100).toFixed(2)}% below ${(MIN_WIN_RATE * 100).toFixed(2)}%`,
            value: metrics.win_rate,
            threshold: MIN_WIN_RATE,
          });
        }
      }

      // Check recent executions for latency issues
      const { data: recentExecutions } = await supabaseClient
        .from('executions')
        .select('*')
        .eq('asset', asset)
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
        .order('created_at', { ascending: false })
        .limit(50);

      if (recentExecutions && recentExecutions.length > 0) {
        const avgLatency = recentExecutions.reduce((sum, e) => sum + (e.latency_ms || 0), 0) / recentExecutions.length;
        
        if (avgLatency > LATENCY_THRESHOLD_MS) {
          alerts.push({
            severity: 'warning',
            asset,
            type: 'high_latency',
            message: `Average execution latency ${avgLatency.toFixed(0)}ms exceeds ${LATENCY_THRESHOLD_MS}ms`,
            value: avgLatency,
            threshold: LATENCY_THRESHOLD_MS,
          });
        }

        // Check for consecutive failures
        let consecutiveFails = 0;
        for (const exec of recentExecutions) {
          if (exec.status === 'rejected' || exec.status === 'cancelled') {
            consecutiveFails++;
            if (consecutiveFails >= MAX_CONSECUTIVE_LOSSES) {
              alerts.push({
                severity: 'critical',
                asset,
                type: 'consecutive_failures',
                message: `${consecutiveFails} consecutive execution failures`,
                value: consecutiveFails,
                threshold: MAX_CONSECUTIVE_LOSSES,
              });

              await pauseAssetTrading(supabaseClient, asset, 'Consecutive execution failures');
              actions.push({
                asset,
                action: 'pause_trading',
                reason: 'consecutive_failures',
              });
              break;
            }
          } else {
            break;
          }
        }
      }

      // Check for shadow model issues
      const { data: shadowModel } = await supabaseClient
        .from('models')
        .select('*')
        .eq('asset', asset)
        .eq('status', 'shadow')
        .single();

      if (shadowModel && shadowModel.metadata?.last_update) {
        const lastUpdate = new Date(shadowModel.metadata.last_update);
        const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
        
        // If shadow hasn't been updated in 48 hours, it might be stuck
        if (hoursSinceUpdate > 48) {
          alerts.push({
            severity: 'info',
            asset,
            type: 'stale_shadow',
            message: `Shadow model hasn't been updated in ${hoursSinceUpdate.toFixed(1)} hours`,
            value: hoursSinceUpdate,
          });
        }

        // Check for excessive KL divergence in updates
        if (shadowModel.metadata?.update_metrics?.kl_divergence > 0.1) {
          alerts.push({
            severity: 'warning',
            asset,
            type: 'high_kl_divergence',
            message: `Shadow model KL divergence ${shadowModel.metadata.update_metrics.kl_divergence.toFixed(4)} is high`,
            value: shadowModel.metadata.update_metrics.kl_divergence,
          });
        }
      }
    }

    // Check global system health
    const { data: queuedSignals, count: queuedCount } = await supabaseClient
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued')
      .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // Older than 5 min

    if (queuedCount && queuedCount > 10) {
      alerts.push({
        severity: 'warning',
        type: 'signal_queue_backup',
        message: `${queuedCount} signals queued for >5 minutes`,
        value: queuedCount,
      });
    }

    // Sort alerts by severity
    const sortedAlerts = alerts.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity as keyof typeof severityOrder] - 
             severityOrder[b.severity as keyof typeof severityOrder];
    });

    const response = {
      timestamp: new Date().toISOString(),
      status: alerts.some(a => a.severity === 'critical') ? 'critical' : 
              alerts.some(a => a.severity === 'warning') ? 'degraded' : 'healthy',
      alerts: sortedAlerts,
      actions_taken: actions,
      models_monitored: activeModels.length,
    };

    console.log(`Safety check complete: ${alerts.length} alerts, ${actions.length} actions taken`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in safety-monitor:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function pauseAssetTrading(supabase: any, asset: string, reason: string) {
  console.log(`Pausing trading for ${asset}: ${reason}`);
  
  // Disable all user preferences for this asset
  await supabase
    .from('user_asset_prefs')
    .update({ enabled: false })
    .eq('asset', asset);

  // Log the safety action (could create a safety_actions table)
  console.log(`Trading paused for ${asset} - ${reason}`);
}
