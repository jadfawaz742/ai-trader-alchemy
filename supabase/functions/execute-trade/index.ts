import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { portfolioId, symbol, tradeType, quantity, currentPrice } = await req.json();

    if (!portfolioId || !symbol || !tradeType || !quantity || !currentPrice) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${tradeType} order: ${quantity} shares of ${symbol} at $${currentPrice}`);

    // Get portfolio and risk parameters
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single();

    const { data: riskParams } = await supabase
      .from('risk_parameters')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .single();

    if (!portfolio || !riskParams) {
      return new Response(JSON.stringify({ error: 'Portfolio or risk parameters not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate PPO signals
    const ppoSignal = await calculatePPOSignal(symbol, riskParams);
    
    // Calculate risk score
    const riskScore = calculateRiskScore(tradeType, quantity, currentPrice, portfolio, riskParams, ppoSignal);

    // Validate trade against risk parameters
    const validationResult = validateTrade(tradeType, quantity, currentPrice, portfolio, riskParams, ppoSignal);
    if (!validationResult.valid) {
      return new Response(JSON.stringify({ error: validationResult.reason }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Execute the trade
    const totalAmount = quantity * currentPrice;
    const newBalance = tradeType === 'BUY' 
      ? portfolio.current_balance - totalAmount 
      : portfolio.current_balance + totalAmount;

    // Record the trade
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert({
        portfolio_id: portfolioId,
        symbol: symbol.toUpperCase(),
        trade_type: tradeType,
        quantity,
        price: currentPrice,
        total_amount: totalAmount,
        ppo_signal: ppoSignal,
        risk_score: riskScore,
      })
      .select()
      .single();

    if (tradeError) {
      console.error('Error recording trade:', tradeError);
      return new Response(JSON.stringify({ error: 'Failed to record trade' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update portfolio balance
    await supabase
      .from('portfolios')
      .update({ current_balance: newBalance })
      .eq('id', portfolioId);

    // Update or create position
    await updatePosition(portfolioId, symbol, tradeType, quantity, currentPrice);

    return new Response(JSON.stringify({ 
      success: true, 
      trade,
      ppoSignal,
      riskScore,
      newBalance 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in execute-trade function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function calculatePPOSignal(symbol: string, riskParams: any) {
  // Generate mock price history for PPO calculation
  // In production, this would fetch real historical data
  const prices = generateMockPriceHistory(20); // 20 periods
  
  const fastEMA = calculateEMA(prices, riskParams.ppo_fast_period);
  const slowEMA = calculateEMA(prices, riskParams.ppo_slow_period);
  
  // Calculate PPO
  const ppo = ((fastEMA - slowEMA) / slowEMA) * 100;
  
  // Calculate signal line (EMA of PPO)
  const ppoHistory = [ppo, ppo * 0.95, ppo * 1.05]; // Mock PPO history
  const signalLine = calculateEMA(ppoHistory, riskParams.ppo_signal_period);
  
  const histogram = ppo - signalLine;
  
  return {
    ppo: Number(ppo.toFixed(4)),
    signalLine: Number(signalLine.toFixed(4)),
    histogram: Number(histogram.toFixed(4)),
    signal: histogram > riskParams.ppo_buy_threshold ? 'BUY' : 
            histogram < riskParams.ppo_sell_threshold ? 'SELL' : 'HOLD',
    strength: Math.abs(histogram)
  };
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  
  const multiplier = 2 / (period + 1);
  let ema = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

function generateMockPriceHistory(periods: number): number[] {
  const basePrice = 100 + Math.random() * 100;
  const prices = [basePrice];
  
  for (let i = 1; i < periods; i++) {
    const change = (Math.random() - 0.5) * 0.05; // ±2.5% daily change
    prices.push(prices[i - 1] * (1 + change));
  }
  
  return prices;
}

function calculateRiskScore(tradeType: string, quantity: number, price: number, portfolio: any, riskParams: any, ppoSignal: any): number {
  const positionValue = quantity * price;
  const positionPercent = (positionValue / portfolio.current_balance) * 100;
  
  let riskScore = 0;
  
  // Position size risk
  if (positionPercent > riskParams.max_position_size) {
    riskScore += 30;
  } else if (positionPercent > riskParams.max_position_size * 0.8) {
    riskScore += 20;
  } else if (positionPercent > riskParams.max_position_size * 0.6) {
    riskScore += 10;
  }
  
  // PPO signal risk
  if (tradeType === 'BUY' && ppoSignal.signal === 'SELL') {
    riskScore += 25;
  } else if (tradeType === 'SELL' && ppoSignal.signal === 'BUY') {
    riskScore += 25;
  } else if (ppoSignal.signal === 'HOLD') {
    riskScore += 10;
  }
  
  // PPO strength risk
  if (ppoSignal.strength < 0.5) {
    riskScore += 15;
  }
  
  return Math.min(riskScore, 100);
}

function validateTrade(tradeType: string, quantity: number, price: number, portfolio: any, riskParams: any, ppoSignal: any) {
  const totalAmount = quantity * price;
  const positionValue = quantity * price;
  const positionPercent = (positionValue / portfolio.current_balance) * 100;
  
  // Check if enough balance for buy orders
  if (tradeType === 'BUY' && totalAmount > portfolio.current_balance) {
    return { valid: false, reason: 'Insufficient balance for this trade' };
  }
  
  // Check position size limits
  if (positionPercent > riskParams.max_position_size) {
    return { 
      valid: false, 
      reason: `Position size (${positionPercent.toFixed(1)}%) exceeds maximum allowed (${riskParams.max_position_size}%)` 
    };
  }
  
  // Check PPO signal alignment (warning, not blocking)
  if (tradeType === 'BUY' && ppoSignal.signal === 'SELL') {
    console.warn('Buy order placed against PPO sell signal');
  } else if (tradeType === 'SELL' && ppoSignal.signal === 'BUY') {
    console.warn('Sell order placed against PPO buy signal');
  }
  
  return { valid: true };
}

async function updatePosition(portfolioId: string, symbol: string, tradeType: string, quantity: number, price: number) {
  const { data: existingPosition } = await supabase
    .from('positions')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .eq('symbol', symbol.toUpperCase())
    .single();

  if (existingPosition) {
    // Update existing position
    let newQuantity, newAveragePrice, newTotalCost;
    
    if (tradeType === 'BUY') {
      newQuantity = existingPosition.quantity + quantity;
      newTotalCost = existingPosition.total_cost + (quantity * price);
      newAveragePrice = newTotalCost / newQuantity;
    } else {
      newQuantity = existingPosition.quantity - quantity;
      newTotalCost = existingPosition.total_cost - (quantity * existingPosition.average_price);
      newAveragePrice = newQuantity > 0 ? newTotalCost / newQuantity : 0;
    }

    const currentValue = newQuantity * price;
    const unrealizedPnl = currentValue - newTotalCost;

    await supabase
      .from('positions')
      .update({
        quantity: newQuantity,
        average_price: newAveragePrice,
        current_price: price,
        total_cost: newTotalCost,
        current_value: currentValue,
        unrealized_pnl: unrealizedPnl,
      })
      .eq('id', existingPosition.id);
  } else if (tradeType === 'BUY') {
    // Create new position for buy orders
    const totalCost = quantity * price;
    await supabase
      .from('positions')
      .insert({
        portfolio_id: portfolioId,
        symbol: symbol.toUpperCase(),
        quantity,
        average_price: price,
        current_price: price,
        total_cost: totalCost,
        current_value: totalCost,
        unrealized_pnl: 0,
      });
  }
}