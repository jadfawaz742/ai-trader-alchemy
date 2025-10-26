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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if trading is globally enabled
    const { data: flags } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'trading_enabled_global')
      .single();

    if (!flags?.enabled) {
      return new Response(JSON.stringify({ 
        status: 'paused',
        message: 'Trading is globally disabled'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user has active asset preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('user_asset_prefs')
      .select('*')
      .eq('user_id', user.id)
      .eq('enabled', true);

    if (prefsError || !prefs || prefs.length === 0) {
      return new Response(JSON.stringify({ 
        status: 'no_assets',
        message: 'No active asset preferences configured'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Triggering trading cycle for user ${user.id} with ${prefs.length} assets`);

    // Invoke the generate-signals service
    const { data: result, error: invokeError } = await supabase.functions.invoke(
      'generate-signals',
      {
        body: {}
      }
    );

    if (invokeError) {
      console.error('Error invoking inference service:', invokeError);
      return new Response(JSON.stringify({ 
        error: 'Failed to trigger trading cycle',
        details: invokeError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      status: 'success',
      message: 'Trading cycle triggered successfully',
      result
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error triggering trading cycle:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
