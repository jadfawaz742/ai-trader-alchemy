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

    const { signal_id } = await req.json();

    if (!signal_id) {
      return new Response(JSON.stringify({ error: 'signal_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch signal with related data
    const { data: signal, error: signalError } = await supabaseClient
      .from('signals')
      .select(`
        *,
        broker_connections!inner(
          id,
          broker_id,
          encrypted_credentials
        )
      `)
      .eq('id', signal_id)
      .eq('status', 'queued')
      .single();

    if (signalError || !signal) {
      console.error('Signal not found or not queued:', signalError);
      return new Response(JSON.stringify({ error: 'Signal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate HMAC signature
    const hmacSecret = Deno.env.get('HMAC_SECRET') || '';
    const vpsEndpoint = Deno.env.get('VPS_ENDPOINT');

    if (!vpsEndpoint) {
      console.error('VPS_ENDPOINT not configured');
      return new Response(JSON.stringify({ error: 'VPS not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const timestamp = Date.now();
    const canonicalString = [
      signal.id,
      signal.asset,
      signal.side,
      signal.qty.toString(),
      signal.order_type,
      signal.limit_price?.toString() || '',
      signal.tp?.toString() || '',
      signal.sl?.toString() || '',
      timestamp.toString(),
    ].join('|');

    const encoder = new TextEncoder();
    const keyData = encoder.encode(hmacSecret);
    const messageData = encoder.encode(canonicalString);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Prepare payload for VPS
    const payload = {
      signal_id: signal.id,
      user_id: signal.user_id,
      broker_conn_id: signal.broker_connections.id,
      asset: signal.asset,
      side: signal.side,
      qty: signal.qty,
      order_type: signal.order_type,
      limit_price: signal.limit_price,
      tp: signal.tp,
      sl: signal.sl,
      model_id: signal.model_id,
      model_version: signal.model_version,
      ts: timestamp,
      dedupe_key: signal.dedupe_key,
      sig: signature,
    };

    console.log(`Sending signal ${signal.id} to VPS`);

    // Update signal status to 'sent'
    await supabaseClient
      .from('signals')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', signal.id);

    // Send to VPS with retry logic
    const startTime = Date.now();
    let lastError = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const vpsResponse = await fetch(vpsEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const latency = Date.now() - startTime;
        const responseData = await vpsResponse.json();

        if (vpsResponse.ok) {
          // Success - update signal and create execution record
          await supabaseClient
            .from('signals')
            .update({ 
              status: 'executed', 
              executed_at: new Date().toISOString() 
            })
            .eq('id', signal.id);

          await supabaseClient
            .from('executions')
            .insert({
              signal_id: signal.id,
              user_id: signal.user_id,
              broker_id: signal.broker_id,
              asset: signal.asset,
              side: signal.side,
              qty: signal.qty,
              executed_price: responseData.executed_price,
              executed_qty: responseData.executed_qty,
              order_id: responseData.order_id,
              status: responseData.status || 'filled',
              latency_ms: latency,
              raw_response: responseData,
            });

          console.log(`Signal ${signal.id} executed successfully in ${latency}ms`);

          return new Response(JSON.stringify({
            success: true,
            execution: responseData,
            latency_ms: latency,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          lastError = responseData;
          console.error(`VPS execution failed (attempt ${attempt}/3):`, responseData);
          
          if (attempt < 3) {
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
        }
      } catch (error) {
        lastError = error;
        console.error(`VPS request failed (attempt ${attempt}/3):`, error);
        
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    // All retries failed
    await supabaseClient
      .from('signals')
      .update({ 
        status: 'failed',
        error_message: JSON.stringify(lastError),
      })
      .eq('id', signal.id);

    await supabaseClient
      .from('executions')
      .insert({
        signal_id: signal.id,
        user_id: signal.user_id,
        broker_id: signal.broker_id,
        asset: signal.asset,
        side: signal.side,
        qty: signal.qty,
        status: 'rejected',
        raw_response: { error: lastError },
      });

    return new Response(JSON.stringify({
      error: 'Execution failed after 3 attempts',
      details: lastError,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in execute-signal:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
