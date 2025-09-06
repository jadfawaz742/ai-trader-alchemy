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

    console.log(`Executing ${tradeType} trade: ${quantity} shares of ${symbol} at $${currentPrice}`);

    // Fetch portfolio and risk parameters
    const [portfolioResult, riskParamsResult] = await Promise.all([
      supabase.from('portfolios').select('*').eq('id', portfolioId).single(),
      supabase.from('risk_parameters').select('*').eq('portfolio_id', portfolioId).single()
    ]);

    if (portfolioResult.error || riskParamsResult.error) {
      return new Response(JSON.stringify({ error: 'Portfolio or risk parameters not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const portfolio = portfolioResult.data;
    const riskParams = riskParamsResult.data;

    // Calculate PPO signal
    const ppoSignal = await calculatePPOSignal(symbol, riskParams);
    
    // Calculate risk score
    const riskScore = calculateRiskScore(tradeType, ppoSignal, riskParams);

    // Validate trade based on risk parameters
    const validationResult = validateTrade(tradeType, quantity, currentPrice, portfolio, riskParams, ppoSignal);
    
    if (!validationResult.isValid) {
      return new Response(JSON.stringify({ 
        error: 'Trade rejected by risk management',
        reason: validationResult.reason,
        ppoSignal,
        riskScore 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Execute the trade
    const tradeResult = await executeTrade(portfolioId, symbol, tradeType, quantity, currentPrice, ppoSignal, riskScore);

    if (!tradeResult.success) {
      return new Response(JSON.stringify({ error: tradeResult.error }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      trade: tradeResult.trade,
      ppoSignal,
      riskScore,
      message: `Successfully executed ${tradeType} order for ${quantity} shares of ${symbol}`
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
  // Simulate PPO calculation with mock historical data
  // In a real implementation, you would fetch actual historical price data
  
  const prices = generateMockPriceHistory(symbol, 50); // Last 50 days
  
  const ema12 = calculateEMA(prices, riskParams.ppo_fast_period);
  const ema26 = calculateEMA(prices, riskParams.ppo_slow_period);
  
  // PPO = ((EMA12 - EMA26) / EMA26) * 100
  const ppoLine = ((ema12 - ema26) / ema26) * 100;
  
  // Mock signal line calculation
  const signalLine = ppoLine * 0.8; // Simplified signal line
  
  const histogram = ppoLine - signalLine;
  
  return {
    ppoLine: Number(ppoLine.toFixed(4)),
    signalLine: Number(signalLine.toFixed(4)),
    histogram: Number(histogram.toFixed(4)),
    trend: ppoLine > signalLine ? 'bullish' : 'bearish',
    strength: Math.abs(histogram)
  };
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  
  const multiplier = 2 / (period + 1);
  let ema = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

function generateMockPriceHistory(symbol: string, days: number): number[] {
  const basePrice = 100 + (symbol.charCodeAt(0) % 50);
  const prices: number[] = [];
  
  for (let i = 0; i < days; i++) {
    const randomChange = (Math.random() - 0.5) * 0.1; // ±5% max change
    const price = i === 0 ? basePrice : prices[i - 1] * (1 + randomChange);
    prices.push(Math.max(price, 10)); // Minimum price of $10
  }
  
  return prices;
}

function calculateRiskScore(tradeType: string, ppoSignal: any, riskParams: any): number {
  let riskScore = 50; // Base risk score
  
  // Adjust based on PPO signal alignment
  if (tradeType === 'BUY') {
    if (ppoSignal.ppoLine > riskParams.ppo_buy_threshold) {
      riskScore -= 20; // Lower risk when PPO supports the trade
    } else {
      riskScore += 30; // Higher risk when PPO opposes the trade
    }
  } else if (tradeType === 'SELL') {
    if (ppoSignal.ppoLine < riskParams.ppo_sell_threshold) {
      riskScore -= 20; // Lower risk when PPO supports the trade
    } else {
      riskScore += 30; // Higher risk when PPO opposes the trade
    }
  }
  
  // Adjust based on PPO strength
  riskScore -= ppoSignal.strength * 10;
  
  // Ensure risk score is between 0 and 100
  return Math.max(0, Math.min(100, Number(riskScore.toFixed(2))));
}

function validateTrade(tradeType: string, quantity: number, price: number, portfolio: any, riskParams: any, ppoSignal: any) {
  const totalValue = quantity * price;
  
  // Check if enough balance for buy orders
  if (tradeType === 'BUY' && totalValue > portfolio.current_balance) {
    return {
      isValid: false,
      reason: `Insufficient balance. Required: $${totalValue.toFixed(2)}, Available: $${portfolio.current_balance}`
    };
  }
  
  // Check position size limits
  const positionValue = (totalValue / portfolio.current_balance) * 100;
  if (tradeType === 'BUY' && positionValue > riskParams.max_position_size) {
    return {
      isValid: false,
      reason: `Position size (${positionValue.toFixed(2)}%) exceeds maximum allowed (${riskParams.max_position_size}%)`
    };
  }
  
  // Check PPO signal alignment
  if (tradeType === 'BUY' && ppoSignal.ppoLine < riskParams.ppo_buy_threshold) {
    return {
      isValid: false,
      reason: `PPO signal (${ppoSignal.ppoLine}) below buy threshold (${riskParams.ppo_buy_threshold}). Market conditions not favorable for buying.`
    };
  }
  
  if (tradeType === 'SELL' && ppoSignal.ppoLine > riskParams.ppo_sell_threshold) {
    return {
      isValid: false,
      reason: `PPO signal (${ppoSignal.ppoLine}) above sell threshold (${riskParams.ppo_sell_threshold}). Market conditions not favorable for selling.`
    };
  }
  
  return { isValid: true };
}

async function executeTrade(portfolioId: string, symbol: string, tradeType: string, quantity: number, price: number, ppoSignal: any, riskScore: number) {
  const totalAmount = quantity * price;
  
  try {
    // Insert the trade record
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert({
        portfolio_id: portfolioId,
        symbol,
        trade_type: tradeType,
        quantity,
        price,
        total_amount: totalAmount,
        ppo_signal: ppoSignal,
        risk_score: riskScore
      })
      .select()
      .single();
    
    if (tradeError) {
      throw new Error(`Failed to record trade: ${tradeError.message}`);
    }
    
    // Update or create position
    await updatePosition(portfolioId, symbol, tradeType, quantity, price);
    
    // Update portfolio balance
    await updatePortfolioBalance(portfolioId, tradeType, totalAmount);
    
    return { success: true, trade };
  } catch (error) {
    console.error('Error executing trade:', error);
    return { success: false, error: error.message };
  }
}

async function updatePosition(portfolioId: string, symbol: string, tradeType: string, quantity: number, price: number) {
  // Get existing position
  const { data: existingPosition } = await supabase
    .from('positions')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .eq('symbol', symbol)
    .single();
  
  if (existingPosition) {
    let newQuantity = existingPosition.quantity;
    let newTotalCost = existingPosition.total_cost;
    
    if (tradeType === 'BUY') {
      newQuantity += quantity;
      newTotalCost += (quantity * price);
    } else {
      newQuantity -= quantity;
      newTotalCost -= (quantity * existingPosition.average_price);
    }
    
    const newAveragePrice = newQuantity > 0 ? newTotalCost / newQuantity : 0;
    
    if (newQuantity <= 0) {
      // Close position
      await supabase
        .from('positions')
        .delete()
        .eq('portfolio_id', portfolioId)
        .eq('symbol', symbol);
    } else {
      // Update position
      await supabase
        .from('positions')
        .update({
          quantity: newQuantity,
          average_price: newAveragePrice,
          total_cost: newTotalCost,
          current_price: price
        })
        .eq('portfolio_id', portfolioId)
        .eq('symbol', symbol);
    }
  } else if (tradeType === 'BUY') {
    // Create new position
    await supabase
      .from('positions')
      .insert({
        portfolio_id: portfolioId,
        symbol,
        quantity,
        average_price: price,
        current_price: price,
        total_cost: quantity * price
      });
  }
}

async function updatePortfolioBalance(portfolioId: string, tradeType: string, totalAmount: number) {
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('current_balance')
    .eq('id', portfolioId)
    .single();
    
  if (portfolio) {
    const balanceChange = tradeType === 'BUY' ? -totalAmount : totalAmount;
    const newBalance = portfolio.current_balance + balanceChange;
    
    await supabase
      .from('portfolios')
      .update({ current_balance: newBalance })
      .eq('id', portfolioId);
  }
}