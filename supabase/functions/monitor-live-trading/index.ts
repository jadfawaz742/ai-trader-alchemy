import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";

interface DailyMetrics {
  date: Date;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  largest_win: number;
  largest_loss: number;
  max_drawdown: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('📊 Starting trading performance monitoring...');

    // Get all active users
    const { data: activeUsers } = await supabaseClient
      .from('user_asset_prefs')
      .select('user_id, asset')
      .eq('enabled', true);

    if (!activeUsers || activeUsers.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No active users to monitor' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const alerts = [];
    const today = new Date().toISOString().split('T')[0];

    // Group by user
    const userAssets = activeUsers.reduce((acc, { user_id, asset }) => {
      if (!acc[user_id]) acc[user_id] = [];
      acc[user_id].push(asset);
      return acc;
    }, {} as Record<string, string[]>);

    for (const [userId, assets] of Object.entries(userAssets)) {
      for (const asset of assets) {
        // Calculate daily metrics
        const { data: todayExecutions } = await supabaseClient
          .from('executions')
          .select('*')
          .eq('user_id', userId)
          .eq('asset', asset)
          .gte('created_at', today);

        if (!todayExecutions || todayExecutions.length === 0) continue;

        // Calculate metrics
        let totalPnL = 0;
        let winningTrades = 0;
        let losingTrades = 0;
        let largestWin = 0;
        let largestLoss = 0;

        for (const exec of todayExecutions) {
          const pnl = (exec.executed_price || 0) * (exec.executed_qty || 0);
          totalPnL += pnl;
          
          if (pnl > 0) {
            winningTrades++;
            largestWin = Math.max(largestWin, pnl);
          } else {
            losingTrades++;
            largestLoss = Math.min(largestLoss, pnl);
          }
        }

        const totalTrades = todayExecutions.length;
        const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

        // Check for drawdown alert
        if (totalPnL < -1000) { // $1000 loss threshold
          alerts.push({
            user_id: userId,
            asset,
            alert_type: 'DRAWDOWN',
            severity: totalPnL < -2000 ? 'CRITICAL' : 'HIGH',
            message: `Daily loss of $${Math.abs(totalPnL).toFixed(2)} detected for ${asset}`
          });
        }

        // Check for losing streak
        let consecutiveLosses = 0;
        const recentTrades = todayExecutions.slice(-10);
        for (let i = recentTrades.length - 1; i >= 0; i--) {
          const pnl = (recentTrades[i].executed_price || 0) * (recentTrades[i].executed_qty || 0);
          if (pnl < 0) consecutiveLosses++;
          else break;
        }

        if (consecutiveLosses >= 5) {
          alerts.push({
            user_id: userId,
            asset,
            alert_type: 'LOSING_STREAK',
            severity: 'HIGH',
            message: `${consecutiveLosses} consecutive losing trades detected for ${asset}`
          });
        }

        // Check for model degradation
        const { data: validation } = await supabaseClient
          .from('model_validations')
          .select('avg_test_win_rate')
          .eq('asset', asset)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (validation && validation.avg_test_win_rate) {
          const winRateDrop = validation.avg_test_win_rate - winRate;
          if (winRateDrop > 0.15 && totalTrades >= 10) {
            alerts.push({
              user_id: userId,
              asset,
              alert_type: 'MODEL_DEGRADATION',
              severity: 'MEDIUM',
              message: `Model performance degraded: Win rate dropped by ${(winRateDrop * 100).toFixed(1)}% for ${asset}`
            });
          }
        }
      }
    }

    // Insert alerts
    if (alerts.length > 0) {
      const { error: alertError } = await supabaseClient
        .from('trading_alerts')
        .insert(alerts);

      if (alertError) {
        console.error('Error inserting alerts:', alertError);
      } else {
        console.log(`✅ Created ${alerts.length} trading alerts`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      users_monitored: Object.keys(userAssets).length,
      alerts_created: alerts.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in monitor-live-trading:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});