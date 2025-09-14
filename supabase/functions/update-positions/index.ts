import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Updating positions for user: ${user.id}`);

    // Get all positions for the user
    const { data: positions, error: positionsError } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id);

    if (positionsError) {
      throw new Error(`Failed to fetch positions: ${positionsError.message}`);
    }

    if (!positions || positions.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        message: 'No positions to update',
        updatedPositions: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let updatedCount = 0;

    // Update each position with current market price
    for (const position of positions) {
      try {
        // Generate realistic current price (simulate market movement)
        const currentPrice = generateCurrentPrice(position.symbol, position.current_price);
        const currentValue = position.quantity * currentPrice;
        const unrealizedPnL = currentValue - position.total_cost;

        // Update the position
        const { error: updateError } = await supabase
          .from('positions')
          .update({
            current_price: currentPrice,
            current_value: currentValue,
            unrealized_pnl: unrealizedPnL,
            updated_at: new Date().toISOString()
          })
          .eq('id', position.id)
          .eq('user_id', user.id);

        if (updateError) {
          console.error(`Failed to update position ${position.symbol}:`, updateError);
        } else {
          updatedCount++;
          console.log(`Updated ${position.symbol}: $${position.current_price} → $${currentPrice.toFixed(2)}`);
        }
      } catch (error) {
        console.error(`Error updating position ${position.symbol}:`, error);
      }
    }

    // Update portfolio total P&L
    await updatePortfolioTotals(user.id);

    return new Response(JSON.stringify({ 
      success: true,
      message: `Successfully updated ${updatedCount} positions`,
      updatedPositions: updatedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-positions function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateCurrentPrice(symbol: string, lastPrice: number): number {
  // Simulate realistic price movement (±5% max change)
  const volatility = 0.02; // 2% volatility
  const randomChange = (Math.random() - 0.5) * 2 * volatility;
  const newPrice = lastPrice * (1 + randomChange);
  
  // Ensure price doesn't go below $1
  return Math.max(1, Number(newPrice.toFixed(2)));
}

async function updatePortfolioTotals(userId: string) {
  try {
    // Get all portfolios for the user
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', userId);

    if (!portfolios) return;

    for (const portfolio of portfolios) {
      // Get all positions for this portfolio
      const { data: positions } = await supabase
        .from('positions')
        .select('current_value, unrealized_pnl')
        .eq('portfolio_id', portfolio.id)
        .eq('user_id', userId);

      if (positions) {
        const totalPositionsValue = positions.reduce((sum, pos) => sum + (pos.current_value || 0), 0);
        const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);
        const totalPortfolioValue = portfolio.current_balance + totalPositionsValue;
        const totalPnL = totalPortfolioValue - portfolio.initial_balance;

        // Update portfolio with new totals
        await supabase
          .from('portfolios')
          .update({
            total_pnl: totalPnL,
            updated_at: new Date().toISOString()
          })
          .eq('id', portfolio.id)
          .eq('user_id', userId);
      }
    }
  } catch (error) {
    console.error('Error updating portfolio totals:', error);
  }
}