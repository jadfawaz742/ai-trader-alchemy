import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FAILURE_THRESHOLD = 5;
const TIMEOUT_MS = 60000; // 1 minute

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { service_name, operation } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get current circuit breaker state
    const { data: state, error: stateError } = await supabase
      .from('circuit_breaker_state')
      .select('*')
      .eq('service_name', service_name)
      .single();

    if (stateError && stateError.code !== 'PGRST116') {
      throw stateError;
    }

    // Initialize state if doesn't exist
    if (!state) {
      await supabase
        .from('circuit_breaker_state')
        .insert({
          service_name,
          status: 'closed',
          failure_count: 0
        });

      return new Response(
        JSON.stringify({ status: 'closed', can_proceed: true }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check circuit breaker status
    if (state.status === 'open') {
      const timeSinceOpen = Date.now() - new Date(state.opened_at).getTime();
      
      if (timeSinceOpen > TIMEOUT_MS) {
        // Move to half-open state
        await supabase
          .from('circuit_breaker_state')
          .update({ status: 'half_open' })
          .eq('service_name', service_name);

        console.log(`🔄 Circuit breaker for ${service_name} entering half-open state`);
        
        return new Response(
          JSON.stringify({ status: 'half_open', can_proceed: true }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            status: 'open',
            can_proceed: false,
            retry_after: Math.ceil((TIMEOUT_MS - timeSinceOpen) / 1000)
          }),
          {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Record operation result
    if (operation === 'success') {
      await supabase
        .from('circuit_breaker_state')
        .update({
          failure_count: 0,
          last_success_at: new Date().toISOString(),
          status: 'closed'
        })
        .eq('service_name', service_name);

      if (state.status === 'half_open') {
        console.log(`✅ Circuit breaker for ${service_name} closed - system recovered`);
      }

      return new Response(
        JSON.stringify({ status: 'closed', can_proceed: true }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } else if (operation === 'failure') {
      const newFailureCount = state.failure_count + 1;
      
      if (newFailureCount >= FAILURE_THRESHOLD) {
        // Open circuit breaker
        await supabase
          .from('circuit_breaker_state')
          .update({
            status: 'open',
            failure_count: newFailureCount,
            opened_at: new Date().toISOString(),
            last_failure_at: new Date().toISOString()
          })
          .eq('service_name', service_name);

        console.error(`🚨 Circuit breaker opened for ${service_name} - system paused`);

        // Create alert
        await supabase
          .from('trading_alerts')
          .insert({
            alert_type: 'system',
            severity: 'critical',
            asset: 'SYSTEM',
            message: `Circuit breaker triggered for ${service_name}`,
            user_id: '00000000-0000-0000-0000-000000000000' // System user
          });

        return new Response(
          JSON.stringify({
            status: 'open',
            can_proceed: false,
            retry_after: Math.ceil(TIMEOUT_MS / 1000)
          }),
          {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } else {
        // Increment failure count
        await supabase
          .from('circuit_breaker_state')
          .update({
            failure_count: newFailureCount,
            last_failure_at: new Date().toISOString()
          })
          .eq('service_name', service_name);

        return new Response(
          JSON.stringify({
            status: state.status,
            can_proceed: true,
            failure_count: newFailureCount
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    return new Response(
      JSON.stringify({ status: state.status, can_proceed: state.status !== 'open' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('Circuit breaker error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
