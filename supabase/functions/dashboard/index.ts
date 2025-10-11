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

    console.log(`📊 Fetching dashboard data for user: ${user.id}`);

    // Fetch broker connections
    const { data: brokers } = await supabase
      .from('broker_connections')
      .select('*, brokers(name, supports_crypto, supports_stocks)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    // Fetch user asset preferences
    const { data: assetPrefs } = await supabase
      .from('user_asset_prefs')
      .select('*, brokers(name)')
      .eq('user_id', user.id)
      .order('asset', { ascending: true });

    // Fetch recent signals (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSignals } = await supabase
      .from('signals')
      .select('*, executions(*)')
      .eq('user_id', user.id)
      .gte('created_at', yesterday)
      .order('created_at', { ascending: false })
      .limit(50);

    // Fetch recent executions with performance
    const { data: executions } = await supabase
      .from('executions')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', yesterday)
      .order('created_at', { ascending: false })
      .limit(100);

    // Calculate PnL and stats
    const totalExecutions = executions?.length || 0;
    const successfulExecutions = executions?.filter(e => e.status === 'executed').length || 0;
    const failedExecutions = executions?.filter(e => e.status === 'rejected').length || 0;
    
    // Aggregate by asset
    const assetStats = new Map();
    executions?.forEach(exec => {
      if (!assetStats.has(exec.asset)) {
        assetStats.set(exec.asset, {
          asset: exec.asset,
          total_trades: 0,
          successful: 0,
          failed: 0,
          total_qty: 0
        });
      }
      const stats = assetStats.get(exec.asset);
      stats.total_trades++;
      if (exec.status === 'executed') stats.successful++;
      if (exec.status === 'rejected') stats.failed++;
      stats.total_qty += Number(exec.executed_qty || 0);
    });

    // Fetch portfolio data if exists
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Fetch positions
    const { data: positions } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id);

    const dashboardData = {
      user: {
        id: user.id,
        email: user.email
      },
      brokers: {
        connected: brokers?.filter(b => b.status === 'active').length || 0,
        pending: brokers?.filter(b => b.status === 'pending').length || 0,
        failed: brokers?.filter(b => b.status === 'failed').length || 0,
        list: brokers || []
      },
      assets: {
        enabled: assetPrefs?.filter(a => a.enabled).length || 0,
        total: assetPrefs?.length || 0,
        list: assetPrefs || []
      },
      signals: {
        last_24h: recentSignals?.length || 0,
        queued: recentSignals?.filter(s => s.status === 'queued').length || 0,
        sent: recentSignals?.filter(s => s.status === 'sent').length || 0,
        executed: recentSignals?.filter(s => s.status === 'executed').length || 0,
        failed: recentSignals?.filter(s => s.status === 'failed').length || 0,
        list: recentSignals || []
      },
      executions: {
        last_24h: totalExecutions,
        successful: successfulExecutions,
        failed: failedExecutions,
        success_rate: totalExecutions > 0 ? (successfulExecutions / totalExecutions * 100).toFixed(1) : '0',
        by_asset: Array.from(assetStats.values())
      },
      portfolio: portfolio || null,
      positions: positions || [],
      risk: {
        total_exposure: positions?.reduce((sum, p) => sum + Number(p.current_value || 0), 0) || 0,
        unrealized_pnl: positions?.reduce((sum, p) => sum + Number(p.unrealized_pnl || 0), 0) || 0
      }
    };

    return new Response(JSON.stringify(dashboardData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Dashboard error:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
