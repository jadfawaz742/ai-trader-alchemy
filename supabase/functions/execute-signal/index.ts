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

    // Fetch signal with related data including broker capabilities
    const { data: signal, error: signalError } = await supabaseClient
      .from('signals')
      .select(`
        *,
        broker_connections!inner(
          id,
          broker_id,
          encrypted_credentials,
          brokers!inner(
            name,
            supports_crypto,
            supports_stocks
          )
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

    console.log('Processing signal:', signal_id, 'for asset:', signal.asset);

    // Validate broker asset support
    const { data: brokerAsset, error: assetError } = await supabaseClient
      .from('broker_assets')
      .select('*')
      .eq('broker_id', signal.broker_connections.broker_id)
      .eq('asset', signal.asset)
      .single();

    if (assetError || !brokerAsset) {
      console.error('Asset not supported by broker:', signal.asset);
      await supabaseClient
        .from('signals')
        .update({ 
          status: 'failed',
          error_message: `Asset ${signal.asset} not supported by broker`
        })
        .eq('id', signal_id);
      
      return new Response(JSON.stringify({ 
        error: 'Asset not supported by broker' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize quantity and prices according to broker rules
    let normalizedQty = signal.qty;
    const stepSize = parseFloat(brokerAsset.step_size);
    const minQty = parseFloat(brokerAsset.min_qty);
    
    // Round qty to step size
    normalizedQty = Math.floor(normalizedQty / stepSize) * stepSize;
    
    if (normalizedQty < minQty) {
      console.error('Quantity below minimum:', normalizedQty, '<', minQty);
      await supabaseClient
        .from('signals')
        .update({ 
          status: 'failed',
          error_message: `Quantity ${normalizedQty} below minimum ${minQty}`
        })
        .eq('id', signal_id);
      
      return new Response(JSON.stringify({ 
        error: 'Quantity below minimum' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Round prices to tick size
    const tickSize = parseFloat(brokerAsset.tick_size);
    const normalizedLimitPrice = signal.limit_price ? 
      Math.round(signal.limit_price / tickSize) * tickSize : null;
    const normalizedSl = signal.sl ? 
      Math.round(signal.sl / tickSize) * tickSize : null;
    const normalizedTp = signal.tp ? 
      Math.round(signal.tp / tickSize) * tickSize : null;

    // Helper function to generate HMAC signature
    async function generateSignature(timestampMs: number) {
      const hmacSecret = Deno.env.get('HMAC_SECRET');
      if (!hmacSecret) {
        throw new Error('HMAC_SECRET not configured');
      }

      const payload = {
        signal_id: signal.id,
        asset: signal.asset,
        broker_symbol: brokerAsset.broker_symbol,
        side: signal.side,
        qty: normalizedQty,
        order_type: signal.order_type,
        limit_price: normalizedLimitPrice,
        sl: normalizedSl,
        tp: normalizedTp,
        broker_id: signal.broker_connections.broker_id,
        user_id: signal.user_id,
        credentials: signal.broker_connections.encrypted_credentials,
        timestamp: timestampMs,
      };

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(hmacSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(JSON.stringify(payload))
      );

      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      return { payload, signature: signatureHex };
    }

    let timestamp = Date.now();
    let { payload, signature: signatureHex } = await generateSignature(timestamp);

    // Update signal status to 'sent'
    await supabaseClient
      .from('signals')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', signal_id);

    // Send to VPS with retry logic for 400/401/500 errors
    const vpsEndpoint = Deno.env.get('VPS_ENDPOINT');
    if (!vpsEndpoint) {
      throw new Error('VPS_ENDPOINT not configured');
    }

    let lastError: any = null;
    let vpsResponse: Response | null = null;
    const maxRetries = 3;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxRetries}: Sending to VPS`);
        
        // Validate timestamp is within ±30s window
        const now = Date.now();
        const timeDiff = Math.abs(now - timestamp);
        if (timeDiff > 30000) {
          console.log('Timestamp outside window, regenerating');
          timestamp = now;
          const sigData = await generateSignature(timestamp);
          payload = sigData.payload;
          signatureHex = sigData.signature;
        }
        
        vpsResponse = await fetch(vpsEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signature': signatureHex,
          },
          body: JSON.stringify(payload),
        });

        const latency = Date.now() - startTime;
        let responseData;
        
        try {
          responseData = await vpsResponse.json();
        } catch (e) {
          responseData = { error: 'Invalid JSON response from VPS' };
        }

        // Handle specific retry cases
        if (vpsResponse.status === 401 && attempt < maxRetries) {
          // Invalid HMAC - regenerate with fresh timestamp
          console.log('401 Unauthorized - regenerating signature with fresh timestamp');
          timestamp = Date.now();
          const sigData = await generateSignature(timestamp);
          payload = sigData.payload;
          signatureHex = sigData.signature;
          await new Promise(resolve => setTimeout(resolve, attempt * 500));
          continue;
        }

        if (vpsResponse.status === 400 && attempt < maxRetries) {
          // Stale timestamp - generate new one immediately
          console.log('400 Bad Request - likely stale timestamp, regenerating');
          timestamp = Date.now();
          const sigData = await generateSignature(timestamp);
          payload = sigData.payload;
          signatureHex = sigData.signature;
          await new Promise(resolve => setTimeout(resolve, 200));
          continue;
        }

        if (vpsResponse.status === 429) {
          console.log('VPS returned 429: Duplicate signal - skipping');
          await supabaseClient
            .from('signals')
            .update({ 
              status: 'executed', 
              executed_at: new Date().toISOString(),
              error_message: 'Duplicate signal - already processed'
            })
            .eq('id', signal_id);

          return new Response(JSON.stringify({
            success: true,
            message: 'Signal already processed (duplicate)',
            latency_ms: latency,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (vpsResponse.ok) {
          // Success - update signal and create execution record
          await supabaseClient
            .from('signals')
            .update({ 
              status: 'executed', 
              executed_at: new Date().toISOString() 
            })
            .eq('id', signal_id);

          // Create episode entry for online learning
          await supabaseClient
            .from('episodes')
            .insert({
              user_id: signal.user_id,
              asset: signal.asset,
              version: signal.model_version,
              start_ts: new Date().toISOString(),
              metadata: {
                signal_id: signal.id,
                entry_price: responseData.executed_price,
                side: signal.side,
                qty: normalizedQty,
              },
            });

          await supabaseClient
            .from('executions')
            .insert({
              signal_id: signal.id,
              user_id: signal.user_id,
              broker_id: signal.broker_id,
              asset: signal.asset,
              side: signal.side,
              qty: normalizedQty,
              executed_price: responseData.executed_price,
              executed_qty: responseData.executed_qty,
              order_id: responseData.order_id,
              status: responseData.status || 'filled',
              latency_ms: latency,
              raw_response: responseData,
            });

          console.log(`Signal ${signal_id} executed successfully in ${latency}ms`);

          return new Response(JSON.stringify({
            success: true,
            execution: responseData,
            latency_ms: latency,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (vpsResponse.status === 500 && attempt < maxRetries) {
          // Server error - exponential backoff
          lastError = responseData;
          console.error(`VPS returned 500, retrying in ${attempt * 1000}ms`);
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          continue;
        }

        // For other statuses, break the retry loop
        lastError = responseData;
        console.error(`VPS execution failed with status ${vpsResponse.status}:`, responseData);
        break;
      } catch (error) {
        lastError = error;
        console.error(`Attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
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
      .eq('id', signal_id);

    await supabaseClient
      .from('executions')
      .insert({
        signal_id: signal.id,
        user_id: signal.user_id,
        broker_id: signal.broker_id,
        asset: signal.asset,
        side: signal.side,
        qty: normalizedQty,
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
