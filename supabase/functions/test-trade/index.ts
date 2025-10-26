import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get auth user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { 
      asset = 'BTCUSDT', 
      side = 'BUY', 
      qty = 0.001,
      price,
      sl_pct = 2.0,
      tp_pct = 3.0
    } = await req.json();

    console.log(`🧪 TEST TRADE: Creating test signal for ${side} ${qty} ${asset}`);

    // Get active broker connection
    const { data: connection } = await supabaseClient
      .from('broker_connections')
      .select('id, broker')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!connection) {
      return new Response(JSON.stringify({ 
        error: 'No active broker connection found' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get current price if not provided
    let currentPrice = price;
    if (!currentPrice) {
      const { data: marketData } = await supabaseClient
        .from('market_data')
        .select('current_price')
        .eq('symbol', asset)
        .single();
      
      currentPrice = marketData?.current_price || 0;
    }

    if (!currentPrice) {
      return new Response(JSON.stringify({ 
        error: 'Could not determine current price' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate SL/TP
    const sl = side === 'BUY' 
      ? currentPrice * (1 - sl_pct / 100)
      : currentPrice * (1 + sl_pct / 100);
    
    const tp = side === 'BUY'
      ? currentPrice * (1 + tp_pct / 100)
      : currentPrice * (1 - tp_pct / 100);

    // Create test signal
    const { data: signal, error: signalError } = await supabaseClient
      .from('signals')
      .insert({
        user_id: user.id,
        asset,
        side,
        qty,
        limit_price: currentPrice,
        sl,
        tp,
        status: 'queued',
        confidence: 1.0,
        reasoning: `🧪 TEST TRADE: Manual test signal created via test-trade function`,
        broker_connection_id: connection.id,
        broker: connection.broker,
        paper_trading: true
      })
      .select()
      .single();

    if (signalError) {
      console.error('Error creating test signal:', signalError);
      return new Response(JSON.stringify({ error: signalError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ Test signal created: ${signal.id}`);
    console.log(`   Asset: ${asset}, Side: ${side}, Qty: ${qty}`);
    console.log(`   Price: ${currentPrice}, SL: ${sl.toFixed(2)}, TP: ${tp.toFixed(2)}`);

    // Invoke paper-trade function
    const { data: paperTradeResult, error: paperTradeError } = await supabaseClient.functions.invoke(
      'paper-trade',
      { body: { signal_id: signal.id } }
    );

    if (paperTradeError) {
      console.error('Error invoking paper-trade:', paperTradeError);
      return new Response(JSON.stringify({ 
        signal,
        paper_trade_error: paperTradeError.message 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      signal,
      paper_trade: paperTradeResult,
      message: '🧪 Test trade created and executed in paper trading mode'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in test-trade:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
