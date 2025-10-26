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
    console.log(`📋 User ID: ${user.id}`);
    console.log(`📋 Asset: ${asset}, Side: ${side}, Qty: ${qty}`);

    // Get connected broker connection
    const { data: connection, error: connectionError } = await supabaseClient
      .from('broker_connections')
      .select('id, broker_id')
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .single();

    if (connectionError) {
      console.error('❌ Error fetching broker connection:', connectionError);
      return new Response(JSON.stringify({ 
        error: `Failed to fetch broker connection: ${connectionError.message}` 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!connection) {
      return new Response(JSON.stringify({ 
        error: 'No connected broker found. Please connect to Binance Testnet first.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🔌 Broker connection found:`, connection);

    // Get current price if not provided
    let currentPrice = price;
    if (!currentPrice) {
      try {
        // Fetch current price from Binance directly
        const binanceUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${asset}`;
        console.log(`📊 Fetching price from Binance: ${binanceUrl}`);
        const response = await fetch(binanceUrl);
        const priceData = await response.json();
        currentPrice = parseFloat(priceData.price);
        console.log(`📊 Fetched current price from Binance: ${currentPrice}`);
      } catch (priceError) {
        console.error('Error fetching price from Binance:', priceError);
        currentPrice = 0;
      }
    }

    if (!currentPrice || currentPrice === 0) {
      return new Response(JSON.stringify({ 
        error: `Could not determine current price for ${asset}. Please provide a price manually.`
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

    console.log(`💰 Price: ${currentPrice}, SL: ${sl}, TP: ${tp}`);

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
        broker_id: connection.broker_id
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
    console.log(`   Broker ID: ${connection.broker_id}`);

    return new Response(JSON.stringify({
      success: true,
      signal,
      message: `🧪 Test signal created for ${asset}. The orchestrator will process it automatically.`
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
