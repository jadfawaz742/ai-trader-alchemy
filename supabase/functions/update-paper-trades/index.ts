import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchCurrentPrice } from '../_shared/market-data-fetcher.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaperTrade {
  id: string;
  user_id: string;
  asset: string;
  side: string;
  qty: number;
  entry_price: number;
  sl: number;
  tp: number;
  pnl: number;
  status: string;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { user_id } = await req.json().catch(() => ({}));

    console.log('🔄 Starting paper trade P&L update...');

    // Fetch open paper trades
    let query = supabase
      .from('paper_trades')
      .select('*')
      .eq('status', 'open');

    if (user_id) {
      query = query.eq('user_id', user_id);
      console.log(`📊 Updating for user: ${user_id}`);
    } else {
      console.log('📊 Updating all open trades (cron mode)');
    }

    const { data: trades, error: fetchError } = await query;

    if (fetchError) throw fetchError;

    if (!trades || trades.length === 0) {
      console.log('✅ No open trades to update');
      return new Response(
        JSON.stringify({ success: true, message: 'No open trades', updated: 0, closed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📈 Processing ${trades.length} open positions...`);

    const priceCache = new Map<string, number>();
    let updatedCount = 0;
    let closedCount = 0;
    const closedTrades: any[] = [];

    for (const trade of trades) {
      try {
        // Get current price (cached)
        let currentPrice = priceCache.get(trade.asset);
        if (!currentPrice) {
          currentPrice = await fetchCurrentPrice(trade.asset);
          priceCache.set(trade.asset, currentPrice);
        }

        // Calculate unrealized P&L
        const priceDiff = trade.side === 'BUY' 
          ? currentPrice - trade.entry_price 
          : trade.entry_price - currentPrice;
        const unrealizedPnL = priceDiff * trade.qty;

        // Check if TP or SL hit
        let shouldClose = false;
        let exitReason = '';

        if (trade.side === 'BUY') {
          if (currentPrice >= trade.tp) {
            shouldClose = true;
            exitReason = 'tp';
            console.log(`✅ TP hit for ${trade.asset}: ${currentPrice} >= ${trade.tp}`);
          } else if (currentPrice <= trade.sl) {
            shouldClose = true;
            exitReason = 'sl';
            console.log(`🛑 SL hit for ${trade.asset}: ${currentPrice} <= ${trade.sl}`);
          }
        } else { // SELL
          if (currentPrice <= trade.tp) {
            shouldClose = true;
            exitReason = 'tp';
            console.log(`✅ TP hit for ${trade.asset}: ${currentPrice} <= ${trade.tp}`);
          } else if (currentPrice >= trade.sl) {
            shouldClose = true;
            exitReason = 'sl';
            console.log(`🛑 SL hit for ${trade.asset}: ${currentPrice} >= ${trade.sl}`);
          }
        }

        if (shouldClose) {
          // Close the position
          const { error: closeError } = await supabase
            .from('paper_trades')
            .update({
              status: 'closed',
              exit_price: currentPrice,
              exit_reason: exitReason,
              pnl: unrealizedPnL,
              closed_at: new Date().toISOString(),
            })
            .eq('id', trade.id);

          if (closeError) {
            console.error(`❌ Error closing trade ${trade.id}:`, closeError);
          } else {
            closedCount++;
            closedTrades.push({
              asset: trade.asset,
              side: trade.side,
              pnl: unrealizedPnL,
              reason: exitReason,
            });
            console.log(`🔒 Closed ${trade.asset} ${trade.side} position: $${unrealizedPnL.toFixed(2)} (${exitReason})`);
          }
        } else {
          // Update unrealized P&L
          const { error: updateError } = await supabase
            .from('paper_trades')
            .update({ pnl: unrealizedPnL })
            .eq('id', trade.id);

          if (updateError) {
            console.error(`❌ Error updating trade ${trade.id}:`, updateError);
          } else {
            updatedCount++;
          }
        }
      } catch (error) {
        console.error(`❌ Error processing trade ${trade.id}:`, error);
      }
    }

    console.log(`✅ Update complete: ${updatedCount} updated, ${closedCount} closed`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: updatedCount,
        closed: closedCount,
        closedTrades,
        message: `Updated ${updatedCount} positions, closed ${closedCount} positions`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
