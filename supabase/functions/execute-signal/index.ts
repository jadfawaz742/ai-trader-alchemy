import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { SignalExecutionSchema, validateInput, createValidationErrorResponse } from '../_shared/validation-schemas.ts';

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

    // Parse and validate request (Phase 2: Input validation)
    const body = await req.json();
    let validatedData;
    try {
      validatedData = validateInput(SignalExecutionSchema, body);
    } catch (error) {
      return createValidationErrorResponse(error as Error, corsHeaders);
    }
    
    const { signal_id } = validatedData;

    // Fetch signal with broker info
    const { data: signal, error: signalError } = await supabaseClient
      .from('signals')
      .select(`
        *,
        brokers:broker_id(
          id,
          name,
          supports_crypto,
          supports_stocks
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

    // Fetch broker connection separately
    const { data: brokerConnection, error: connError } = await supabaseClient
      .from('broker_connections')
      .select('*')
      .eq('user_id', signal.user_id)
      .eq('broker_id', signal.broker_id)
      .single();
    
    if (connError || !brokerConnection) {
      console.error('Broker connection not found:', connError);
      return new Response(JSON.stringify({ error: 'Broker connection not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Audit log for signal processing
    await supabaseClient.from('service_role_audit').insert({
      function_name: 'execute-signal',
      action: 'signal_processing_started',
      user_id: signal.user_id,
      metadata: { signal_id, asset: signal.asset }
    });

    console.log('Processing signal:', signal_id, 'for asset:', signal.asset);

    // Fetch user's paper trading preference
    const { data: userPref } = await supabaseClient
      .from('user_asset_prefs')
      .select('paper_trading_enabled')
      .eq('user_id', signal.user_id)
      .eq('asset', signal.asset)
      .single();

    const isTestMode = userPref?.paper_trading_enabled ?? true; // Default to paper trading for safety
    console.log(`📋 Paper trading mode for ${signal.asset}: ${isTestMode}`);

    // PHASE 4: Pre-execution risk checks
    const { data: userPositions } = await supabaseClient
      .from('executions')
      .select('*')
      .eq('user_id', signal.user_id)
      .eq('status', 'executed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

    // Calculate current daily PnL and check risk limits
    let dailyPnL = 0;
    if (userPositions) {
      for (const pos of userPositions) {
        // Simplified PnL calculation - should be enhanced with real-time prices
        dailyPnL += (pos.executed_price || 0) * (pos.executed_qty || 0) * (pos.side === 'BUY' ? -1 : 1);
      }
    }

    // Check if user has breached daily loss cap
    const MAX_DAILY_LOSS = 0.05; // 5% max daily loss
    const { data: userRiskParams } = await supabaseClient
      .from('risk_parameters')
      .select('*')
      .eq('user_id', signal.user_id)
      .single();

    const accountBalance = 100000; // TODO: Fetch from user's account
    const dailyLossPercent = Math.abs(dailyPnL) / accountBalance;

    if (dailyLossPercent > MAX_DAILY_LOSS) {
      console.log(`❌ Risk limit violated: Daily loss ${(dailyLossPercent * 100).toFixed(2)}% exceeds ${(MAX_DAILY_LOSS * 100).toFixed(2)}%`);
      
      await supabaseClient.from('signals').update({
        status: 'blocked_by_risk',
        error_message: `Risk limit exceeded: ${(dailyLossPercent * 100).toFixed(2)}% daily loss`
      }).eq('id', signal_id);

      // Create alert
      await supabaseClient.from('trading_alerts').insert({
        user_id: signal.user_id,
        asset: signal.asset,
        alert_type: 'RISK_BREACH',
        severity: 'CRITICAL',
        message: `Daily loss limit exceeded: ${(dailyLossPercent * 100).toFixed(2)}%`
      });

      return new Response(JSON.stringify({ 
        error: 'Risk limits exceeded',
        reason: 'Daily loss limit'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate broker asset support
    const { data: brokerAsset, error: assetError } = await supabaseClient
      .from('broker_assets')
      .select('*')
      .eq('broker_id', signal.broker_id)
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

    // Helper function to generate HMAC signature using VPS canonical format
    async function generateSignature(ts: number) {
      const hmacSecret = Deno.env.get('HMAC_SECRET');
      if (!hmacSecret) {
        console.error('❌ HMAC_SECRET environment variable is not set!');
        throw new Error('HMAC_SECRET not configured');
      }
      console.log(`✅ HMAC_SECRET is configured (length: ${hmacSecret.length})`);

      // CRITICAL: Canonical format must match payload exactly (lowercase side/order_type)
      // Canonical format: signal_id|asset|side|qty|order_type|limit_price|tp|sl|ts|test_mode
      const canonical = [
        signal.id,
        signal.asset,
        signal.side.toLowerCase(),        // Match payload format
        normalizedQty.toString(),
        signal.order_type.toLowerCase(),  // Match payload format
        normalizedLimitPrice?.toString() ?? '',  // Empty string for null
        normalizedTp?.toString() ?? '',
        normalizedSl?.toString() ?? '',
        ts.toString(),
        isTestMode.toString()  // Include test_mode in signature
      ].join('|');

      console.log('🔐 HMAC Signature Generation:');
      console.log('  Canonical string:', canonical);
      console.log('  Timestamp:', ts);
      console.log('  Secret length:', hmacSecret.length);

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
        encoder.encode(canonical)
      );

      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      console.log('  Signature:', signatureHex);

      return signatureHex;
    }

    let ts = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    let signatureHex = await generateSignature(ts);
    const dedupeKey = `${signal.id}-${ts}`;

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
        console.log(`Attempt ${attempt}/${maxRetries}: Sending to VPS at ${vpsEndpoint}`);
        
        // Validate timestamp is within ±30s window
        const now = Math.floor(Date.now() / 1000);
        const timeDiff = Math.abs(now - ts);
        if (timeDiff > 30) {
          console.log('Timestamp outside window, regenerating');
          ts = now;
          signatureHex = await generateSignature(ts);
        }
        
        // Build payload matching VPS specification
        const payload = {
          signal_id: signal.id,
          user_id: signal.user_id,
          broker_conn_id: brokerConnection.id,
          asset: signal.asset,
          side: signal.side.toLowerCase(),
          qty: normalizedQty,
          order_type: signal.order_type.toLowerCase(),
          limit_price: normalizedLimitPrice,
          tp: normalizedTp,
          sl: normalizedSl,
          model_id: signal.model_id || 'ppo_default',
          model_version: signal.model_version || 'v1.0',
          account_type: brokerConnection.encrypted_credentials?.account_type || 'live',
          ts: ts,
          dedupe_key: dedupeKey,
          sig: signatureHex,  // Signature in body, not header
          test_mode: isTestMode  // Enable paper trading via VPS Binance testnet
        };

        console.log('Sending payload to VPS:', JSON.stringify(payload, null, 2));
        
        vpsResponse = await fetch(vpsEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
          ts = Math.floor(Date.now() / 1000);
          signatureHex = await generateSignature(ts);
          await new Promise(resolve => setTimeout(resolve, attempt * 500));
          continue;
        }

        if (vpsResponse.status === 400 && attempt < maxRetries) {
          // Stale timestamp - generate new one immediately
          console.log('400 Bad Request - likely stale timestamp, regenerating');
          ts = Math.floor(Date.now() / 1000);
          signatureHex = await generateSignature(ts);
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
          // Success - VPS returns {"status":"executed","latency_ms":42}
          console.log(`✅ VPS execution successful:`, responseData);
          
          await supabaseClient
            .from('signals')
            .update({ 
              status: 'executed', 
              executed_at: new Date().toISOString() 
            })
            .eq('id', signal_id);

          if (isTestMode) {
            // ✅ PAPER TRADING: Create paper_trades record for dashboard tracking
            console.log(`📄 Creating paper trade record for ${signal.asset}`);
            
            // Calculate simulated entry price with realistic slippage (0.1%)
            const entryPrice = signal.side.toLowerCase() === 'buy'
              ? (normalizedLimitPrice || 0) * 1.001
              : (normalizedLimitPrice || 0) * 0.999;
            
            await supabaseClient
              .from('paper_trades')
              .insert({
                signal_id: signal.id,
                user_id: signal.user_id,
                asset: signal.asset,
                side: signal.side.toLowerCase(),
                qty: normalizedQty,
                entry_price: entryPrice,
                sl: normalizedSl,
                tp: normalizedTp,
                status: 'open',
              });
            
            console.log(`✅ Paper trade created successfully`);
          } else {
            // 💰 LIVE TRADING: Create executions record
            console.log(`💰 Creating live execution record for ${signal.asset}`);
            
            await supabaseClient
              .from('executions')
              .insert({
                signal_id: signal.id,
                user_id: signal.user_id,
                broker_id: signal.broker_id,
                asset: signal.asset,
                side: signal.side,
                qty: normalizedQty,
                status: responseData.status || 'executed',
                latency_ms: responseData.latency_ms || latency,
                raw_response: responseData,
                executed_price: responseData.executed_price || normalizedLimitPrice,
                executed_qty: responseData.executed_qty || normalizedQty,
              });
          }

          // Create episode entry for online learning (both modes)
          await supabaseClient
            .from('episodes')
            .insert({
              user_id: signal.user_id,
              asset: signal.asset,
              version: signal.model_version || 'v1.0',
              start_ts: new Date().toISOString(),
              metadata: {
                signal_id: signal.id,
                side: signal.side,
                qty: normalizedQty,
                vps_latency_ms: responseData.latency_ms || latency,
                test_mode: isTestMode
              },
            });

          console.log(`Signal ${signal_id} ${isTestMode ? 'paper traded' : 'executed'} successfully in ${latency}ms`);

          return new Response(JSON.stringify({
            success: true,
            execution: responseData,
            latency_ms: latency,
            test_mode: isTestMode
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
