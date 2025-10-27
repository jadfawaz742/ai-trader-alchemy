import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { trade_ids, close_all = false } = await req.json();

    // Fetch open paper trades
    let query = supabaseClient
      .from('paper_trades')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open');

    if (!close_all && trade_ids && trade_ids.length > 0) {
      query = query.in('id', trade_ids);
    }

    const { data: trades, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch trades: ${fetchError.message}`);
    }

    if (!trades || trades.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No open trades to close', closedCount: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch current market prices for all unique assets
    const uniqueAssets = [...new Set(trades.map(t => t.asset))];
    const priceMap = new Map<string, number>();

    for (const asset of uniqueAssets) {
      try {
        const { data: marketData } = await supabaseClient
          .from('market_data')
          .select('current_price')
          .eq('symbol', asset)
          .order('last_updated', { ascending: false })
          .limit(1)
          .single();

        if (marketData?.current_price) {
          priceMap.set(asset, marketData.current_price);
        } else {
          // Fallback: use entry price if no market data
          const trade = trades.find(t => t.asset === asset);
          if (trade) {
            priceMap.set(asset, trade.entry_price);
          }
        }
      } catch (error) {
        console.error(`Error fetching price for ${asset}:`, error);
        // Use entry price as fallback
        const trade = trades.find(t => t.asset === asset);
        if (trade) {
          priceMap.set(asset, trade.entry_price);
        }
      }
    }

    // Close all trades
    const closedTrades = [];
    const now = new Date().toISOString();

    for (const trade of trades) {
      const currentPrice = priceMap.get(trade.asset) || trade.entry_price;
      const pnl = trade.side === 'BUY' 
        ? (currentPrice - trade.entry_price) * trade.qty
        : (trade.entry_price - currentPrice) * trade.qty;

      const { error: updateError } = await supabaseClient
        .from('paper_trades')
        .update({
          status: 'closed',
          exit_price: currentPrice,
          exit_reason: 'manual_close',
          closed_at: now,
          pnl: pnl,
        })
        .eq('id', trade.id);

      if (updateError) {
        console.error(`Error closing trade ${trade.id}:`, updateError);
      } else {
        closedTrades.push({
          id: trade.id,
          asset: trade.asset,
          pnl: pnl,
          exit_price: currentPrice,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully closed ${closedTrades.length} trades`,
        closedCount: closedTrades.length,
        trades: closedTrades,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error closing paper trades:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
