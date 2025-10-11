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

    const { asset, enabled, max_exposure_usd, risk_mode, broker_id } = await req.json();

    if (!asset || !broker_id) {
      return new Response(JSON.stringify({ error: 'Asset and broker_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`⚙️ Updating asset preference for ${asset} by user ${user.id}`);

    // Verify broker connection exists and is active
    const { data: brokerConn } = await supabase
      .from('broker_connections')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('broker_id', broker_id)
      .single();

    if (!brokerConn) {
      return new Response(JSON.stringify({ error: 'Broker connection not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (brokerConn.status !== 'active') {
      return new Response(JSON.stringify({ 
        error: 'Broker connection is not active',
        status: brokerConn.status 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if preference already exists
    const { data: existing } = await supabase
      .from('user_asset_prefs')
      .select('id')
      .eq('user_id', user.id)
      .eq('asset', asset)
      .eq('broker_id', broker_id)
      .single();

    let result;
    if (existing) {
      // Update existing preference
      const { data, error } = await supabase
        .from('user_asset_prefs')
        .update({
          enabled: enabled ?? undefined,
          max_exposure_usd: max_exposure_usd ?? undefined,
          risk_mode: risk_mode ?? undefined,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
      console.log(`✅ Updated preference for ${asset}`);
    } else {
      // Insert new preference
      const { data, error } = await supabase
        .from('user_asset_prefs')
        .insert({
          user_id: user.id,
          asset,
          broker_id,
          enabled: enabled ?? true,
          max_exposure_usd: max_exposure_usd ?? 1000,
          risk_mode: risk_mode ?? 'medium'
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
      console.log(`✅ Created new preference for ${asset}`);
    }

    return new Response(JSON.stringify({ 
      message: 'Asset preference updated successfully',
      preference: result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Update asset prefs error:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
