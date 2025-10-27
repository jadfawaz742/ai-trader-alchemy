import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  status: string;
  created_at: string;
  max_exposure_usd: number;
  risk_mode: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { dryRun = false } = await req.json().catch(() => ({}));

    console.log('🔧 Starting position size correction...');
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE UPDATE'}`);

    // Query active paper trades with suspiciously small quantities
    const { data: trades, error: fetchError } = await supabase
      .from('paper_trades')
      .select(`
        id,
        user_id,
        asset,
        side,
        qty,
        entry_price,
        sl,
        tp,
        status,
        created_at
      `)
      .eq('status', 'open')
      .lt('qty', 0.01);

    if (fetchError) throw fetchError;

    if (!trades || trades.length === 0) {
      console.log('✅ No positions need correction');
      return new Response(
        JSON.stringify({ success: true, message: 'No positions to fix', updated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Found ${trades.length} positions with qty < 0.01`);

    // Get user preferences for each trade
    const updates: any[] = [];
    let updatedCount = 0;

    for (const trade of trades) {
      try {
        // Fetch user preferences
        const { data: prefs, error: prefsError } = await supabase
          .from('user_asset_prefs')
          .select('max_exposure_usd, risk_mode')
          .eq('user_id', trade.user_id)
          .eq('asset', trade.asset)
          .single();

        if (prefsError || !prefs) {
          console.error(`❌ No preferences found for ${trade.asset} (user: ${trade.user_id})`);
          continue;
        }

        // Calculate risk multiplier
        const riskMultipliers: Record<string, number> = {
          conservative: 0.5,
          moderate: 1.0,
          aggressive: 2.0,
        };
        const riskMultiplier = riskMultipliers[prefs.risk_mode] || 1.0;

        // Calculate correct position size
        const baseQty = prefs.max_exposure_usd / trade.entry_price;
        const adjustedQty = baseQty * riskMultiplier;
        
        // Normalize to step size (0.001 for crypto)
        const stepSize = 0.001;
        const correctQty = Math.floor(adjustedQty / stepSize) * stepSize;

        // Fetch current price to recalculate P&L
        const { data: marketData } = await supabase
          .from('market_data')
          .select('current_price')
          .eq('symbol', trade.asset)
          .single();

        const currentPrice = marketData?.current_price || trade.entry_price;

        // Calculate new values
        const currentValue = correctQty * currentPrice;
        const entryValue = correctQty * trade.entry_price;
        const priceDiff = trade.side === 'BUY' 
          ? currentPrice - trade.entry_price 
          : trade.entry_price - currentPrice;
        const pnl = priceDiff * correctQty;
        const pnlPercent = (pnl / entryValue) * 100;

        const updateData = {
          qty: correctQty,
          metadata: {
            qty_corrected: true,
            corrected_at: new Date().toISOString(),
            old_qty: trade.qty,
          },
        };

        updates.push({
          id: trade.id,
          asset: trade.asset,
          side: trade.side,
          oldQty: trade.qty,
          newQty: correctQty,
          maxExposure: prefs.max_exposure_usd,
          riskMode: prefs.risk_mode,
          riskMultiplier,
          estimatedPnL: pnl,
          pnlPercent: pnlPercent.toFixed(2),
        });

        if (!dryRun) {
          const { error: updateError } = await supabase
            .from('paper_trades')
            .update(updateData)
            .eq('id', trade.id);

          if (updateError) {
            console.error(`❌ Failed to update trade ${trade.id}:`, updateError);
          } else {
            updatedCount++;
            console.log(`✅ Updated ${trade.asset}: ${trade.qty} → ${correctQty} (${(correctQty / trade.qty).toFixed(0)}x)`);
          }
        } else {
          console.log(`🔍 Would update ${trade.asset}: ${trade.qty} → ${correctQty} (${(correctQty / trade.qty).toFixed(0)}x)`);
        }
      } catch (error) {
        console.error(`❌ Error processing trade ${trade.id}:`, error);
      }
    }

    const summary = {
      success: true,
      dryRun,
      totalFound: trades.length,
      updated: dryRun ? 0 : updatedCount,
      wouldUpdate: dryRun ? updates.length : undefined,
      updates,
      message: dryRun 
        ? `Dry run: ${updates.length} positions would be corrected`
        : `Updated ${updatedCount} positions successfully`,
    };

    console.log(`✅ Correction complete: ${dryRun ? 'DRY RUN' : updatedCount + ' updated'}`);

    return new Response(
      JSON.stringify(summary),
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
