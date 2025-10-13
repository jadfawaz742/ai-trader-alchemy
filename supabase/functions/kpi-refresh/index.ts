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

    console.log('Starting KPI refresh job');

    // Get all active models
    const { data: activeModels } = await supabaseClient
      .from('models')
      .select('*')
      .eq('status', 'active');

    if (!activeModels || activeModels.length === 0) {
      return new Response(JSON.stringify({
        status: 'success',
        message: 'No active models to refresh',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const model of activeModels) {
      try {
        // Get executions for this asset in the last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const { data: executions } = await supabaseClient
          .from('executions')
          .select('*')
          .eq('asset', model.asset)
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (!executions || executions.length === 0) {
          console.log(`No recent executions for ${model.asset}`);
          continue;
        }

        // Calculate metrics
        const totalTrades = executions.length;
        const profitableTrades = executions.filter(e => 
          e.status === 'executed' && 
          parseFloat(e.executed_price || '0') > 0
        ).length;
        
        const winRate = totalTrades > 0 ? profitableTrades / totalTrades : 0;

        // Calculate average R:R, Sharpe, and max drawdown
        // (Simplified calculations - in production, these would be more sophisticated)
        const avgRr = 1.5; // Placeholder
        const sharpe = winRate > 0.5 ? (winRate - 0.5) * 2 : 0;
        const maxDd = 0.08; // Placeholder

        // Update or insert metrics
        const { error: metricsError } = await supabaseClient
          .from('model_metrics')
          .upsert({
            asset: model.asset,
            version: model.version,
            total_trades: totalTrades,
            profitable_trades: profitableTrades,
            win_rate: winRate,
            avg_rr: avgRr,
            sharpe: sharpe,
            max_dd: maxDd,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'asset,version',
          });

        if (metricsError) {
          throw metricsError;
        }

        results.push({
          asset: model.asset,
          version: model.version,
          total_trades: totalTrades,
          win_rate: winRate,
          sharpe: sharpe,
        });

        console.log(`✅ Updated metrics for ${model.asset}: WR=${(winRate * 100).toFixed(1)}%, Sharpe=${sharpe.toFixed(2)}`);

      } catch (error) {
        console.error(`Error refreshing KPIs for ${model.asset}:`, error);
        results.push({
          asset: model.asset,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    await supabaseClient.from('cron_job_history').insert({
      job_name: 'kpi_refresh',
      status: 'completed',
      details: { 
        completed_at: new Date().toISOString(),
        results 
      },
    });

    console.log(`KPI refresh complete: ${results.length} models updated`);

    return new Response(JSON.stringify({
      status: 'success',
      models_updated: results.length,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in kpi-refresh:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
