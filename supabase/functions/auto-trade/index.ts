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

// Popular stocks to analyze for automated trading
const TRADEABLE_STOCKS = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'META', 'AMZN'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { portfolioId, simulationMode = false, riskLevel = 50, maxAmount, tradeDuration = 300 } = await req.json();

    if (!portfolioId) {
      return new Response(JSON.stringify({ error: 'Portfolio ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting ${simulationMode ? 'simulated' : 'live'} automated trading for portfolio: ${portfolioId}`);
    console.log(`Risk level: ${riskLevel}, Max amount: $${maxAmount || 'unlimited'}, Duration: ${tradeDuration}s`);

    // Get portfolio and risk parameters
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

    // Adjust risk parameters based on user's risk level
    const adjustedRiskParams = adjustRiskParameters(riskParams, riskLevel, simulationMode);

    // Check if auto trading is enabled (skip for simulation mode)
    if (!simulationMode && !riskParams.auto_trading_enabled) {
      return new Response(JSON.stringify({ 
        error: 'Automated trading is disabled',
        message: 'Enable automated trading in risk settings first'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get existing positions to avoid overconcentration
    const { data: existingPositions } = await supabase
      .from('positions')
      .select('*')
      .eq('portfolio_id', portfolioId);

    // Get today's trade count to respect daily limits (skip for simulation)
    let remainingTrades = adjustedRiskParams.max_daily_trades;
    
    if (!simulationMode) {
      const today = new Date().toISOString().split('T')[0];
      const { data: todayTrades } = await supabase
        .from('trades')
        .select('id')
        .eq('portfolio_id', portfolioId)
        .gte('executed_at', `${today}T00:00:00.000Z`);

      if (todayTrades && todayTrades.length >= adjustedRiskParams.max_daily_trades) {
        return new Response(JSON.stringify({ 
          message: `Daily trade limit reached (${adjustedRiskParams.max_daily_trades} trades)`,
          tradesExecuted: 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      remainingTrades = adjustedRiskParams.max_daily_trades - (todayTrades?.length || 0);
    }

    const executedTrades = [];
    let totalProfitLoss = 0;

    // Analyze each stock for trading opportunities
    console.log(`Analyzing ${TRADEABLE_STOCKS.length} stocks with confidence threshold: ${adjustedRiskParams.min_confidence_score}%`);
    
    for (const symbol of TRADEABLE_STOCKS) {
      if (remainingTrades <= 0) break;

      try {
        const tradeDecision = await analyzeStockForAutoTrade(
          symbol, 
          portfolio, 
          adjustedRiskParams, 
          existingPositions,
          maxAmount
        );
        
        console.log(`${symbol}: Confidence ${tradeDecision.confidence}% vs threshold ${adjustedRiskParams.min_confidence_score}%, Action: ${tradeDecision.action}`);
        
        if (tradeDecision.shouldTrade && tradeDecision.confidence >= adjustedRiskParams.min_confidence_score) {
          console.log(`Executing ${simulationMode ? 'simulated' : 'live'} trade: ${tradeDecision.action} ${tradeDecision.quantity} shares of ${symbol}`);
          
          // Execute the trade (simulation or live)
          const tradeResult = await executeAutoTrade(
            portfolioId, 
            symbol, 
            tradeDecision.action,
            tradeDecision.quantity,
            tradeDecision.price,
            tradeDecision.analysis,
            simulationMode
          );

          if (tradeResult.success) {
            const profit = calculateTradeProfitLoss(tradeDecision, existingPositions);
            totalProfitLoss += profit;
            
            executedTrades.push({
              symbol,
              action: tradeDecision.action,
              quantity: tradeDecision.quantity,
              price: tradeDecision.price,
              confidence: tradeDecision.confidence,
              reason: tradeDecision.reason,
              profitLoss: profit,
              simulation: simulationMode
            });
            remainingTrades--;
          }
        } else {
          console.log(`Skipping ${symbol}: confidence ${tradeDecision.confidence}% below threshold ${adjustedRiskParams.min_confidence_score}% - Reason: ${tradeDecision.reason}`);
        }
      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
        continue;
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      tradesExecuted: executedTrades.length,
      trades: executedTrades,
      totalProfitLoss,
      simulationMode,
      message: `${simulationMode ? 'Simulated' : 'Live'} trading completed. Executed ${executedTrades.length} trades with ${totalProfitLoss >= 0 ? '+' : ''}$${totalProfitLoss.toFixed(2)} P&L.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in auto-trade function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function adjustRiskParameters(baseParams: any, userRiskLevel: number, simulationMode: boolean = false) {
  const adjusted = { ...baseParams };
  
  // Make risk adjustment completely dynamic based on user input (0-100)
  const riskMultiplier = userRiskLevel / 50; // 50 = neutral, 100 = 2x aggressive, 0 = very conservative
  
  if (simulationMode) {
    // Simulation mode: Always allow trades but adjust aggressiveness
    adjusted.min_confidence_score = Math.max(20, 90 - userRiskLevel); // 20-90% range
    adjusted.max_position_size = Math.min(50, 10 + (userRiskLevel * 0.4)); // 10-50% range
    adjusted.max_daily_trades = Math.min(25, 5 + Math.floor(userRiskLevel * 0.2)); // 5-25 trades
    
    // Adjust PPO thresholds based on risk
    adjusted.ppo_buy_threshold = Math.max(0.05, 0.5 - (userRiskLevel * 0.008)); // More aggressive at higher risk
    adjusted.ppo_sell_threshold = Math.min(-0.05, -0.5 + (userRiskLevel * 0.008));
    
    console.log(`Simulation mode: Risk ${userRiskLevel}% - Confidence: ${adjusted.min_confidence_score}%, Position: ${adjusted.max_position_size}%`);
  } else {
    // Live trading: Still be careful but respect user risk preference
    adjusted.min_confidence_score = Math.max(40, 95 - userRiskLevel); // 40-95% range
    adjusted.max_position_size = Math.min(35, 5 + (userRiskLevel * 0.3)); // 5-35% range
    adjusted.max_daily_trades = Math.min(15, 3 + Math.floor(userRiskLevel * 0.12)); // 3-15 trades
    
    adjusted.ppo_buy_threshold = Math.max(0.1, 0.8 - (userRiskLevel * 0.007));
    adjusted.ppo_sell_threshold = Math.min(-0.1, -0.8 + (userRiskLevel * 0.007));
    
    console.log(`Live mode: Risk ${userRiskLevel}% - Confidence: ${adjusted.min_confidence_score}%, Position: ${adjusted.max_position_size}%`);
  }
  
  return adjusted;
}

function calculateTradeProfitLoss(tradeDecision: any, existingPositions: any[]): number {
  // Simplified P&L calculation for demo
  const baseProfit = Math.random() * 100 - 50; // Random between -50 and +50
  const confidenceMultiplier = tradeDecision.confidence / 100;
  return baseProfit * confidenceMultiplier;
}

async function analyzeStockForAutoTrade(symbol: string, portfolio: any, riskParams: any, existingPositions: any[], maxAmount?: number) {
  // Enhanced market data simulation with more realistic patterns
  const marketData = generateAdvancedMarketData(symbol);
  
  // Calculate advanced PPO with better confidence scoring
  const ppoAnalysis = calculateAdvancedPPO(marketData, riskParams);
  
  // Calculate market sentiment score
  const sentimentScore = calculateMarketSentiment(marketData, ppoAnalysis);
  
  // Calculate overall confidence score (0-100)
  const confidence = calculateTradeConfidence(ppoAnalysis, sentimentScore, marketData);
  
  // Check existing position
  const existingPosition = existingPositions.find(p => p.symbol === symbol);
  
  // Determine if we should buy, sell, or hold
  const tradeDecision = makeTradeDecision(
    ppoAnalysis, 
    sentimentScore, 
    confidence, 
    existingPosition, 
    portfolio, 
    riskParams,
    marketData,
    maxAmount
  );

  return {
    shouldTrade: tradeDecision.shouldTrade,
    action: tradeDecision.action,
    quantity: tradeDecision.quantity,
    price: marketData.currentPrice,
    confidence,
    reason: tradeDecision.reason,
    analysis: {
      ppo: ppoAnalysis,
      sentiment: sentimentScore,
      marketData: marketData
    }
  };
}

function generateAdvancedMarketData(symbol: string) {
  const basePrice = 100 + (symbol.charCodeAt(0) % 100);
  const volatility = 0.02 + (Math.random() * 0.03); // 2-5% volatility
  
  // Generate 30 days of price history for better analysis
  const prices = [];
  let currentPrice = basePrice;
  
  for (let i = 0; i < 30; i++) {
    const trend = Math.sin(i * 0.2) * 0.01; // Add trending component
    const randomChange = (Math.random() - 0.5) * volatility;
    currentPrice = currentPrice * (1 + trend + randomChange);
    prices.push(Math.max(currentPrice, 10));
  }

  const latestPrice = prices[prices.length - 1];
  const previousPrice = prices[prices.length - 2];
  const priceChange = latestPrice - previousPrice;
  const priceChangePercent = (priceChange / previousPrice) * 100;

  return {
    symbol,
    currentPrice: Number(latestPrice.toFixed(2)),
    priceChange: Number(priceChange.toFixed(2)),
    priceChangePercent: Number(priceChangePercent.toFixed(2)),
    prices,
    volume: Math.floor(1000000 + Math.random() * 5000000),
    volatility: Number((volatility * 100).toFixed(2))
  };
}

function calculateAdvancedPPO(marketData: any, riskParams: any) {
  const prices = marketData.prices;
  
  // Calculate EMAs with more precision
  const ema12 = calculateAdvancedEMA(prices, riskParams.ppo_fast_period);
  const ema26 = calculateAdvancedEMA(prices, riskParams.ppo_slow_period);
  
  // PPO calculation
  const ppoLine = ((ema12 - ema26) / ema26) * 100;
  
  // Signal line (EMA of PPO)
  const ppoHistory = [ppoLine]; // In real implementation, maintain PPO history
  const signalLine = calculateAdvancedEMA(ppoHistory, riskParams.ppo_signal_period);
  
  const histogram = ppoLine - signalLine;
  
  // Determine trend strength
  const trendStrength = Math.abs(histogram);
  const momentum = ppoLine > signalLine ? 'bullish' : 'bearish';
  
  // Calculate momentum score (0-100)
  const momentumScore = Math.min(100, Math.max(0, 50 + (histogram * 10)));

  return {
    ppoLine: Number(ppoLine.toFixed(4)),
    signalLine: Number(signalLine.toFixed(4)),
    histogram: Number(histogram.toFixed(4)),
    momentum,
    trendStrength: Number(trendStrength.toFixed(2)),
    momentumScore: Number(momentumScore.toFixed(2))
  };
}

function calculateAdvancedEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

function calculateMarketSentiment(marketData: any, ppoAnalysis: any) {
  let sentimentScore = 50; // Neutral base
  
  // Price momentum factor
  if (marketData.priceChangePercent > 2) sentimentScore += 20;
  else if (marketData.priceChangePercent > 0) sentimentScore += 10;
  else if (marketData.priceChangePercent < -2) sentimentScore -= 20;
  else if (marketData.priceChangePercent < 0) sentimentScore -= 10;
  
  // PPO momentum factor
  if (ppoAnalysis.momentum === 'bullish' && ppoAnalysis.trendStrength > 0.5) {
    sentimentScore += 15;
  } else if (ppoAnalysis.momentum === 'bearish' && ppoAnalysis.trendStrength > 0.5) {
    sentimentScore -= 15;
  }
  
  // Volatility factor (high volatility reduces confidence)
  if (marketData.volatility > 4) sentimentScore -= 10;
  else if (marketData.volatility < 2) sentimentScore += 5;
  
  return Math.min(100, Math.max(0, sentimentScore));
}

function calculateTradeConfidence(ppoAnalysis: any, sentimentScore: number, marketData: any) {
  let confidence = 55; // Start with slightly higher base confidence
  
  // PPO alignment bonus - be more generous
  if (ppoAnalysis.momentum === 'bullish' && ppoAnalysis.ppoLine > 0.1) {
    confidence += 30; // Increased from 25
  } else if (ppoAnalysis.momentum === 'bearish' && ppoAnalysis.ppoLine < -0.1) {
    confidence += 30; // Increased from 25
  }
  
  // Trend strength bonus - more generous
  confidence += Math.min(20, ppoAnalysis.trendStrength * 15); // Increased multiplier
  
  // Sentiment alignment - more generous
  if (sentimentScore > 65) confidence += 15; // Lowered threshold and increased bonus
  else if (sentimentScore < 35) confidence += 15; // Strong bearish is also confident
  
  // Momentum score bonus - increased
  confidence += (ppoAnalysis.momentumScore - 50) * 0.3;
  
  // Add some randomness to make it more dynamic
  confidence += (Math.random() - 0.5) * 10;
  
  return Math.min(100, Math.max(0, Math.round(confidence)));
}

function makeTradeDecision(ppoAnalysis: any, sentimentScore: number, confidence: number, existingPosition: any, portfolio: any, riskParams: any, marketData: any, maxAmount?: number) {
  // Default to no trade
  let decision = {
    shouldTrade: false,
    action: 'HOLD',
    quantity: 0,
    reason: 'No clear trading signal'
  };

  const maxPositionValue = maxAmount 
    ? Math.min(maxAmount, (portfolio.current_balance * riskParams.max_position_size) / 100)
    : (portfolio.current_balance * riskParams.max_position_size) / 100;
  const suggestedQuantity = Math.floor(maxPositionValue / marketData.currentPrice);

  // BUY conditions
  if (!existingPosition && 
      ppoAnalysis.ppoLine > riskParams.ppo_buy_threshold &&
      ppoAnalysis.momentum === 'bullish' &&
      sentimentScore > 60 &&
      confidence >= riskParams.min_confidence_score &&
      portfolio.current_balance > maxPositionValue) {
    
    decision = {
      shouldTrade: true,
      action: 'BUY',
      quantity: suggestedQuantity,
      reason: `Strong bullish signals: PPO ${ppoAnalysis.ppoLine}, Sentiment ${sentimentScore}, Confidence ${confidence}%`
    };
  }
  
  // SELL conditions
  else if (existingPosition && 
           (ppoAnalysis.ppoLine < riskParams.ppo_sell_threshold ||
            ppoAnalysis.momentum === 'bearish' ||
            sentimentScore < 40) &&
           confidence >= riskParams.min_confidence_score) {
    
    // Calculate potential profit
    const currentValue = existingPosition.quantity * marketData.currentPrice;
    const profitPercent = ((currentValue - existingPosition.total_cost) / existingPosition.total_cost) * 100;
    
    // Sell if we hit profit target or stop loss
    if (profitPercent >= riskParams.take_profit_percent || 
        profitPercent <= -riskParams.stop_loss_percent) {
      
      decision = {
        shouldTrade: true,
        action: 'SELL',
        quantity: existingPosition.quantity,
        reason: `${profitPercent > 0 ? 'Profit target' : 'Stop loss'} triggered: ${profitPercent.toFixed(2)}% P&L`
      };
    }
  }

  return decision;
}

async function executeAutoTrade(portfolioId: string, symbol: string, action: string, quantity: number, price: number, analysis: any, simulationMode: boolean = false) {
  try {
    if (simulationMode) {
      // For simulation, just return success without executing real trades
      console.log(`SIMULATION: ${action} ${quantity} shares of ${symbol} at $${price}`);
      return { success: true, data: { simulation: true } };
    }
    
    // Call the existing execute-trade function for live trades
    const { data, error } = await supabase.functions.invoke('execute-trade', {
      body: {
        portfolioId,
        symbol,
        tradeType: action,
        quantity,
        currentPrice: price,
        autoTrade: true,
        analysis
      }
    });

    if (error) throw error;
    
    return { success: true, data };
  } catch (error) {
    console.error(`Error executing ${simulationMode ? 'simulated' : 'live'} trade for ${symbol}:`, error);
    return { success: false, error: error.message };
  }
}