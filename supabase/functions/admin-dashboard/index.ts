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
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify user and check admin role
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if user is admin
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!userRole) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`👑 Admin dashboard request from: ${user.id}`);

    // Fetch all models with metrics
    const { data: models } = await supabase
      .from('models')
      .select('*, model_metrics(*)')
      .order('created_at', { ascending: false });

    // Fetch training runs
    const { data: trainingRuns } = await supabase
      .from('training_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    // Fetch online learning episodes (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: episodes } = await supabase
      .from('episodes')
      .select('*')
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(100);

    // Fetch cron job history
    const { data: cronHistory } = await supabase
      .from('cron_job_history')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(50);

    // Fetch feature flags
    const { data: featureFlags } = await supabase
      .from('feature_flags')
      .select('*')
      .order('key', { ascending: true });

    // Fetch all broker connections (aggregated)
    const { data: allConnections } = await supabase
      .from('broker_connections')
      .select('status, broker_id, brokers(name)');

    // Aggregate broker stats
    const brokerStats = {
      active: allConnections?.filter(c => c.status === 'active').length || 0,
      pending: allConnections?.filter(c => c.status === 'pending').length || 0,
      failed: allConnections?.filter(c => c.status === 'failed').length || 0,
      by_broker: {}
    };

    allConnections?.forEach(conn => {
      const brokerName = conn.brokers?.name || 'Unknown';
      if (!brokerStats.by_broker[brokerName]) {
        brokerStats.by_broker[brokerName] = { active: 0, pending: 0, failed: 0 };
      }
      brokerStats.by_broker[brokerName][conn.status]++;
    });

    // Aggregate model stats
    const modelStats = {
      total: models?.length || 0,
      active: models?.filter(m => m.status === 'active').length || 0,
      shadow: models?.filter(m => m.status === 'shadow').length || 0,
      deprecated: models?.filter(m => m.status === 'deprecated').length || 0,
      by_asset: {}
    };

    models?.forEach(model => {
      if (!modelStats.by_asset[model.asset]) {
        modelStats.by_asset[model.asset] = {
          active: 0,
          shadow: 0,
          latest_version: '',
          metrics: null
        };
      }
      const assetStat = modelStats.by_asset[model.asset];
      if (model.status === 'active') assetStat.active++;
      if (model.status === 'shadow') assetStat.shadow++;
      if (model.model_metrics && model.model_metrics.length > 0) {
        assetStat.metrics = model.model_metrics[0];
      }
      if (!assetStat.latest_version || model.version > assetStat.latest_version) {
        assetStat.latest_version = model.version;
      }
    });

    // Training stats
    const trainingStats = {
      scheduled: trainingRuns?.filter(t => t.status === 'scheduled').length || 0,
      running: trainingRuns?.filter(t => t.status === 'running').length || 0,
      complete: trainingRuns?.filter(t => t.status === 'complete').length || 0,
      failed: trainingRuns?.filter(t => t.status === 'failed').length || 0
    };

    // Episode stats (online learning)
    const episodeStats = {
      last_7_days: episodes?.length || 0,
      avg_reward: episodes?.reduce((sum, e) => sum + Number(e.reward_sum || 0), 0) / (episodes?.length || 1),
      avg_pnl: episodes?.reduce((sum, e) => sum + Number(e.pnl || 0), 0) / (episodes?.length || 1),
      by_asset: {}
    };

    episodes?.forEach(ep => {
      if (!episodeStats.by_asset[ep.asset]) {
        episodeStats.by_asset[ep.asset] = { count: 0, avg_reward: 0, avg_pnl: 0 };
      }
      const stat = episodeStats.by_asset[ep.asset];
      stat.count++;
      stat.avg_reward += Number(ep.reward_sum || 0);
      stat.avg_pnl += Number(ep.pnl || 0);
    });

    // Calculate averages
    Object.keys(episodeStats.by_asset).forEach(asset => {
      const stat = episodeStats.by_asset[asset];
      stat.avg_reward /= stat.count;
      stat.avg_pnl /= stat.count;
    });

    // System health
    const lastInferenceCron = cronHistory?.find(c => c.job_name === 'inference-service');
    const lastOrchCron = cronHistory?.find(c => c.job_name === 'live-trading-orchestrator');
    
    const systemHealth = {
      trading_enabled: featureFlags?.find(f => f.key === 'trading_enabled')?.enabled || false,
      last_inference: lastInferenceCron?.started_at || null,
      last_orchestrator: lastOrchCron?.started_at || null,
      recent_errors: cronHistory?.filter(c => c.status === 'error').slice(0, 10) || []
    };

    const adminData = {
      models: {
        stats: modelStats,
        list: models || []
      },
      training: {
        stats: trainingStats,
        runs: trainingRuns || []
      },
      online_learning: {
        stats: episodeStats,
        episodes: episodes || []
      },
      brokers: brokerStats,
      system: systemHealth,
      feature_flags: featureFlags || [],
      cron_history: cronHistory || []
    };

    return new Response(JSON.stringify(adminData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Admin dashboard error:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
