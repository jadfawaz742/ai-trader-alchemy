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

    const checks: any = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {},
    };

    // Check database connection
    try {
      const { data, error } = await supabaseClient
        .from('feature_flags')
        .select('*')
        .limit(1);
      
      checks.checks.database = {
        status: error ? 'unhealthy' : 'healthy',
        error: error?.message,
      };
    } catch (error) {
      checks.checks.database = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Check VPS endpoint reachability
    const vpsEndpoint = Deno.env.get('VPS_ENDPOINT');
    if (vpsEndpoint) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const vpsResponse = await fetch(vpsEndpoint, {
          method: 'GET',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        checks.checks.vps = {
          status: vpsResponse.ok ? 'healthy' : 'degraded',
          latency_ms: Date.now(),
          endpoint: vpsEndpoint,
        };
      } catch (error) {
        checks.checks.vps = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Timeout',
          endpoint: vpsEndpoint,
        };
      }
    } else {
      checks.checks.vps = {
        status: 'not_configured',
        error: 'VPS_ENDPOINT not set',
      };
    }

    // Get feature flags status
    const { data: flags } = await supabaseClient
      .from('feature_flags')
      .select('*');
    
    checks.checks.feature_flags = flags?.reduce((acc: any, flag: any) => {
      acc[flag.key] = flag.enabled;
      return acc;
    }, {});

    // Count active signals
    const { count: queuedSignals } = await supabaseClient
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued');

    const { count: activeConnections } = await supabaseClient
      .from('broker_connections')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'connected');

    const { count: activeModels } = await supabaseClient
      .from('models')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    checks.metrics = {
      queued_signals: queuedSignals || 0,
      active_broker_connections: activeConnections || 0,
      active_models: activeModels || 0,
    };

    // Determine overall status
    const unhealthyChecks = Object.values(checks.checks).filter(
      (check: any) => check.status === 'unhealthy'
    );
    
    if (unhealthyChecks.length > 0) {
      checks.status = 'unhealthy';
    } else {
      const degradedChecks = Object.values(checks.checks).filter(
        (check: any) => check.status === 'degraded'
      );
      if (degradedChecks.length > 0) {
        checks.status = 'degraded';
      }
    }

    return new Response(JSON.stringify(checks), {
      status: checks.status === 'healthy' ? 200 : 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in health-check:', error);
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
