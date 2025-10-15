import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get all users who have opted in for daily reports
    const { data: preferences, error: prefsError } = await supabase
      .from('user_report_preferences')
      .select('user_id, daily_report_enabled')
      .eq('daily_report_enabled', true);

    if (prefsError) throw prefsError;

    if (!preferences || preferences.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          reports_generated: 0,
          message: 'No users opted in for daily reports'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let reportsGenerated = 0;

    for (const pref of preferences) {
      try {
        // Generate report for this user
        const report = await generateUserDailyReport(supabase, pref.user_id);
        
        // Store report in history
        await supabase
          .from('report_history')
          .insert({
            user_id: pref.user_id,
            report_type: 'daily',
            report_config: report,
            delivered: true
          });

        reportsGenerated++;
      } catch (error) {
        console.error(`Error generating report for user ${pref.user_id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        reports_generated: reportsGenerated
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('Error generating daily reports:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function generateUserDailyReport(supabase: any, userId: string) {
  const today = new Date().toISOString().split('T')[0];
  
  // Get today's signals
  const { data: signals } = await supabase
    .from('signals')
    .select('*, paper_trades(*)')
    .eq('user_id', userId)
    .gte('created_at', today);

  const executed = signals?.filter(s => s.status === 'executed').length || 0;
  const winning = signals?.filter(s => s.paper_trades?.[0]?.pnl > 0).length || 0;
  const totalPnL = signals?.reduce((sum: number, s: any) => 
    sum + (s.paper_trades?.[0]?.pnl || 0), 0) || 0;

  // Get active alerts
  const { data: alerts } = await supabase
    .from('trading_alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('acknowledged', false)
    .order('created_at', { ascending: false })
    .limit(5);

  // Generate recommendations
  const recommendations = [];
  if (totalPnL < 0) {
    recommendations.push('Review your stop-loss settings to limit losses');
  }
  if (executed > 0 && winning / executed < 0.5) {
    recommendations.push('Win rate below 50% - consider adjusting entry criteria');
  }
  if (signals && signals.length === 0) {
    recommendations.push('No signals generated today - verify your trading preferences');
  }

  return {
    date: today,
    summary: {
      total_signals: signals?.length || 0,
      executed_trades: executed,
      win_rate: executed > 0 ? winning / executed : 0,
      total_pnl: totalPnL
    },
    alerts: alerts || [],
    recommendations
  };
}
