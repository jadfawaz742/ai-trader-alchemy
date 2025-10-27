import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";

interface PaperPosition {
  asset: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  entry_price: number;
  current_price: number;
  sl: number;
  tp: number;
  unrealized_pnl: number;
}

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

    console.log(`🔍 Processing paper trade for signal: ${signal_id}`);

    // Fetch signal
    const { data: signal, error: signalError } = await supabaseClient
      .from('signals')
      .select('*')
      .eq('id', signal_id)
      .single();

    if (signalError) {
      console.error('❌ Error fetching signal:', signalError);
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch signal',
        details: signalError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!signal) {
      console.error('❌ Signal not found:', signal_id);
      return new Response(JSON.stringify({ error: 'Signal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📄 Paper trading: ${signal.side} ${signal.qty} ${signal.asset}`);

    // Apply realistic slippage (0.1%)
    const slippage = 0.001;
    const { data: marketData } = await supabaseClient
      .from('market_data')
      .select('current_price')
      .eq('symbol', signal.asset)
      .single();

    const currentPrice = marketData?.current_price || signal.limit_price || 0;
    const executionPrice = signal.side === 'BUY' 
      ? currentPrice * (1 + slippage)
      : currentPrice * (1 - slippage);

    // Create paper trade
    const { data: paperTrade, error: tradeError } = await supabaseClient
      .from('paper_trades')
      .insert({
        user_id: signal.user_id,
        signal_id: signal.id,
        asset: signal.asset,
        side: signal.side,
        qty: signal.qty,
        entry_price: executionPrice,
        sl: signal.sl,
        tp: signal.tp,
        status: 'open'
      })
      .select()
      .single();

    if (tradeError) {
      console.error('Error creating paper trade:', tradeError);
      return new Response(JSON.stringify({ error: tradeError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update signal status
    await supabaseClient
      .from('signals')
      .update({ 
        status: 'executed', 
        executed_at: new Date().toISOString() 
      })
      .eq('id', signal_id);

    console.log(`✅ Paper trade created: ${paperTrade.id}`);

    return new Response(JSON.stringify({
      success: true,
      paper_trade: paperTrade,
      execution_price: executionPrice,
      slippage_applied: slippage * 100
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in paper-trade:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});