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
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify admin role
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role using service client
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: userRole } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!userRole) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { asset, shadow_version, action } = await req.json();

    if (!asset || !action) {
      return new Response(JSON.stringify({ error: 'Asset and action required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'promote') {
      // Get shadow model
      const { data: shadowModel, error: shadowError } = await serviceClient
        .from('models')
        .select('*')
        .eq('asset', asset)
        .eq('version', shadow_version)
        .eq('status', 'shadow')
        .single();

      if (shadowError || !shadowModel) {
        return new Response(JSON.stringify({ error: 'Shadow model not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get current active model for rollback pointer
      const { data: currentActive } = await serviceClient
        .from('models')
        .select('*')
        .eq('asset', asset)
        .eq('status', 'active')
        .single();

      // Start transaction-like operations
      console.log(`Promoting shadow ${shadow_version} to active for ${asset}`);

      // 1. Mark current active as deprecated
      if (currentActive) {
        await serviceClient
          .from('models')
          .update({ 
            status: 'deprecated',
            metadata: {
              ...currentActive.metadata,
              deprecated_at: new Date().toISOString(),
              replaced_by: shadow_version,
            },
          })
          .eq('id', currentActive.id);
      }

      // 2. Create new production version from shadow
      const prodVersion = shadow_version.replace('_shadow', '');
      
      const { data: newActive, error: createError } = await serviceClient
        .from('models')
        .insert({
          asset,
          version: prodVersion,
          status: 'active',
          model_type: shadowModel.model_type,
          location: shadowModel.location,
          metadata: {
            ...shadowModel.metadata,
            promoted_at: new Date().toISOString(),
            promoted_from: shadow_version,
            promoted_by: user.id,
            rollback_version: currentActive?.version,
          },
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating new active model:', createError);
        
        // Rollback: restore previous active
        if (currentActive) {
          await serviceClient
            .from('models')
            .update({ status: 'active' })
            .eq('id', currentActive.id);
        }
        
        return new Response(JSON.stringify({ error: 'Failed to promote model' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 3. Mark shadow as deprecated
      await serviceClient
        .from('models')
        .update({ 
          status: 'deprecated',
          metadata: {
            ...shadowModel.metadata,
            promoted_to: prodVersion,
          },
        })
        .eq('id', shadowModel.id);

      // 4. Copy metrics to new version
      const { data: shadowMetrics } = await serviceClient
        .from('model_metrics')
        .select('*')
        .eq('asset', asset)
        .eq('version', shadow_version)
        .single();

      if (shadowMetrics) {
        await serviceClient
          .from('model_metrics')
          .insert({
            asset,
            version: prodVersion,
            win_rate: shadowMetrics.win_rate,
            sharpe: shadowMetrics.sharpe,
            max_dd: shadowMetrics.max_dd,
            avg_rr: shadowMetrics.avg_rr,
            total_trades: shadowMetrics.total_trades,
            profitable_trades: shadowMetrics.profitable_trades,
          });
      }

      console.log(`Successfully promoted ${shadow_version} to ${prodVersion}`);

      return new Response(JSON.stringify({
        success: true,
        action: 'promote',
        asset,
        new_active_version: prodVersion,
        previous_version: currentActive?.version,
        rollback_available: !!currentActive,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'rollback') {
      // Get current active model
      const { data: activeModel } = await serviceClient
        .from('models')
        .select('*')
        .eq('asset', asset)
        .eq('status', 'active')
        .single();

      if (!activeModel || !activeModel.metadata?.rollback_version) {
        return new Response(JSON.stringify({ error: 'No rollback version available' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const rollbackVersion = activeModel.metadata.rollback_version;

      // Get the rollback model
      const { data: rollbackModel } = await serviceClient
        .from('models')
        .select('*')
        .eq('asset', asset)
        .eq('version', rollbackVersion)
        .single();

      if (!rollbackModel) {
        return new Response(JSON.stringify({ error: 'Rollback model not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Rolling back ${asset} from ${activeModel.version} to ${rollbackVersion}`);

      // Mark current active as deprecated
      await serviceClient
        .from('models')
        .update({ 
          status: 'deprecated',
          metadata: {
            ...activeModel.metadata,
            rolled_back_at: new Date().toISOString(),
            rolled_back_by: user.id,
          },
        })
        .eq('id', activeModel.id);

      // Restore rollback version to active
      await serviceClient
        .from('models')
        .update({ 
          status: 'active',
          metadata: {
            ...rollbackModel.metadata,
            restored_at: new Date().toISOString(),
            restored_by: user.id,
          },
        })
        .eq('id', rollbackModel.id);

      console.log(`Successfully rolled back to ${rollbackVersion}`);

      return new Response(JSON.stringify({
        success: true,
        action: 'rollback',
        asset,
        active_version: rollbackVersion,
        previous_version: activeModel.version,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in promote-model:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
