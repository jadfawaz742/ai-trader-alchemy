import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { makeAITradingDecision, detectMarketPhase, type TradingState } from "./shared-decision-logic.ts";
import { fetchMultiTimeframeData, analyzeMultiTimeframe, getMultiTimeframeBoost } from "./multi-timeframe.ts";
import { fetchMarketData as fetchUnifiedData, type MarketDataPoint } from "../_shared/market-data-fetcher.ts";
import { isCryptoSymbol, getAssetType } from "../_shared/symbol-utils.ts";

// Force redeploy to pick up PPO inference debugging
const FEATURE_FIX_VERSION = '3.0.0';
console.log(`🔧 generate-signals v${FEATURE_FIX_VERSION} - PPO inference with debug logging`);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PPOModel {
  id: string;
  asset: string;
  version: string;
  location: string;
  metadata: any;
}

interface MarketData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
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

    // Check global kill switch
    const { data: flags } = await supabaseClient
      .from('feature_flags')
      .select('*')
      .eq('key', 'trading_enabled_global')
      .single();

    if (!flags?.enabled) {
      console.log('Trading disabled globally');
      return new Response(JSON.stringify({ 
        message: 'Trading disabled',
        signals_generated: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all active user preferences with broker connections
    // Note: Join through brokers table since there's no direct FK from user_asset_prefs to broker_connections
    const { data: userPrefs, error: prefsError } = await supabaseClient
      .from('user_asset_prefs')
      .select('*')
      .eq('enabled', true);

    if (prefsError) {
      console.error('Error fetching user preferences:', prefsError);
      throw prefsError;
    }

    // Fetch broker connections separately and match them
    const { data: brokerConnections, error: connError } = await supabaseClient
      .from('broker_connections')
      .select(`
        *,
        brokers(
          id,
          name,
          supports_crypto,
          supports_stocks
        )
      `)
      .eq('status', 'connected');

    if (connError) {
      console.error('Error fetching broker connections:', connError);
      throw connError;
    }

    // Match user prefs with their broker connections
    const enrichedUserPrefs = userPrefs
      ?.map(pref => {
        const connection = brokerConnections?.find(
          conn => conn.user_id === pref.user_id && conn.broker_id === pref.broker_id
        );
        if (!connection) return null;
        return {
          ...pref,
          broker_connection: connection
        };
      })
      .filter(Boolean) || [];

    console.log(`Processing ${enrichedUserPrefs.length} active user/asset pairs with valid connections`);

    const signalsGenerated = [];

    for (const pref of enrichedUserPrefs) {
      try {
        // Validate broker supports this asset type
        const isCrypto = isCryptoSymbol(pref.asset);
        const broker = pref.broker_connection.brokers;
        
        if (isCrypto && !broker.supports_crypto) {
          console.warn(`⚠️ Skipping ${pref.asset}: Broker ${broker.name} does not support crypto`);
          continue;
        }
        
        if (!isCrypto && !broker.supports_stocks) {
          console.warn(`⚠️ Skipping ${pref.asset}: Broker ${broker.name} does not support stocks`);
          continue;
        }

        // Load trained AND VALIDATED model for this user and asset (Phase 4)
        const { data: model } = await supabaseClient
          .from('asset_models')
          .select('*')
          .eq('user_id', pref.user_id)
          .eq('symbol', pref.asset)
          .eq('model_status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!model) {
          console.log(`No trained model found for ${pref.asset} (user: ${pref.user_id})`);
          continue;
        }

        // Check if model has been validated (Phase 3 validation)
        const { data: validation } = await supabaseClient
          .from('model_validations')
          .select('approved')
          .eq('model_id', model.id)
          .eq('approved', true)
          .single();

        if (!validation) {
          console.log(`⚠️ Skipping ${pref.asset}: Model not validated yet`);
          continue;
        }
        
        console.log(`✅ Found validated model v${model.model_version} for ${pref.asset}, created: ${model.created_at}`);

        // Get broker symbol mapping
        const { data: symbolMap } = await supabaseClient
          .from('symbol_map')
          .select('broker_symbol')
          .eq('asset', pref.asset)
          .eq('broker_id', pref.broker_id)
          .single();

        const brokerSymbol = symbolMap?.broker_symbol || pref.asset;

        // Fetch comprehensive market data with technical indicators
        const marketData = await fetchMarketData(brokerSymbol, pref.broker_id);
        
        if (!marketData || marketData.length < 50) {
          console.log(`Insufficient market data for ${pref.asset}`);
          continue;
        }

        // Build trading state with technical indicators
        const tradingState = await buildTradingState(marketData, pref.asset);

        // Load model weights from storage (supports both new storage and legacy JSONB)
        let modelWeights = model.model_weights; // Legacy support
        if (model.model_storage_path && !modelWeights) {
          try {
            const { data: storageData } = await supabaseClient.storage
              .from('trained-models')
              .download(model.model_storage_path);
            const weightsJson = await storageData.text();
            modelWeights = JSON.parse(weightsJson);
            console.log(`✅ Loaded model v${model.model_version} from storage for ${pref.asset}`);
          } catch (error) {
            console.error(`❌ Failed to load model from storage: ${error.message}`);
            continue;
          }
        }

        if (!modelWeights) {
          console.error(`❌ No model weights available for ${pref.asset}`);
          continue;
        }

        // Run AI trading decision with full market analysis (pass marketData for PPO inference)
        const decision = await makeAITradingDecision(
          tradingState, 
          pref.asset, 
          true, 
          modelWeights,
          marketData // Pass market data for feature extraction
        );
        
        console.log(`Decision for ${pref.asset}: ${decision.type} (confidence: ${decision.confidence.toFixed(1)}%)`);

        const signal = decision.type !== 'HOLD' ? {
          action: decision.type,
          // Apply model's size multiplier if provided (from PPO inference)
          qty: calculatePositionSize(
            { ...pref, sizeMultiplier: (decision as any).sizeMultiplier || 1.0 }, 
            tradingState.price,
            decision.stopLoss,
            pref.asset
          ),
          order_type: 'MARKET',
          tp: decision.takeProfit,
          sl: decision.stopLoss,
          confidence: decision.confidence,
          reasoning: decision.reasoning,
        } : null;

        if (signal && signal.action !== 'HOLD') {
          // Get venue constraints
          const { data: brokerAsset } = await supabaseClient
            .from('broker_assets')
            .select('*')
            .eq('broker_id', pref.broker_id)
            .eq('asset', pref.asset)
            .single();

          console.log(`📋 Broker constraints for ${pref.asset}:`, {
            min_qty: brokerAsset?.min_qty,
            step_size: brokerAsset?.step_size,
            min_notional: brokerAsset?.min_notional
          });

          // Normalize quantity to venue requirements
          const normalizedQty = normalizeQuantity(
            signal.qty,
            brokerAsset?.min_qty || 0.001,
            brokerAsset?.step_size || 0.001
          );

          // **NEW CHECK**: Skip signal if qty normalization failed
          if (normalizedQty === 0) {
            console.error(`❌ Skipping signal for ${pref.asset} - quantity normalization failed`);
            continue; // Skip this signal
          }

          // Validate position size makes sense
          const positionValue = normalizedQty * tradingState.price;
          const expectedMinValue = pref.max_exposure_usd * 0.1; // At least 10% of max exposure
          
          if (positionValue < expectedMinValue) {
            console.error(`❌ Position size suspiciously small! Skipping signal.
              - Position Value: $${positionValue.toFixed(2)}
              - Expected Min: $${expectedMinValue.toFixed(2)}
              - Max Exposure: $${pref.max_exposure_usd}`);
            continue; // Skip this signal
          }

          // Create signal with dedupe key
          const dedupeKey = `${pref.user_id}_${pref.asset}_${Date.now()}`;
          
          const { data: signalRecord, error: signalError } = await supabaseClient
            .from('signals')
            .insert({
              user_id: pref.user_id,
              asset: pref.asset,
              broker_id: pref.broker_id,
              model_id: model.id,
              model_version: model.created_at || 'v1', // asset_models uses timestamp
              side: signal.action,
              qty: normalizedQty,
              order_type: signal.order_type || 'MARKET',
              limit_price: tradingState.price, // Store current market price as entry reference
              tp: signal.tp,
              sl: signal.sl,
              status: 'queued',
              dedupe_key: dedupeKey,
            })
            .select()
            .single();

          if (signalError) {
            console.error('Error creating signal:', signalError);
            continue;
          }

          signalsGenerated.push(signalRecord);
          console.log(`✅ Generated ${signal.action} signal for ${pref.asset} (qty: ${normalizedQty}, confidence: ${signal.confidence.toFixed(1)}%)`);

          // Queue signal for VPS execution (call execute-signal function)
          await queueSignalExecution(signalRecord, pref);
        }

      } catch (error) {
        console.error(`Error processing ${pref.asset}:`, error);
        continue;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      signals_generated: signalsGenerated.length,
      signals: signalsGenerated,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-signals:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Fetch real market data using unified hybrid approach
async function fetchMarketData(symbol: string, brokerId: string): Promise<MarketData[] | null> {
  const assetType = getAssetType(symbol);
  console.log(`📊 Fetching ${assetType} data for ${symbol}...`);
  
  try {
    const data = await fetchUnifiedData({
      symbol,
      range: '1y',
      interval: '1d'
    });
    
    console.log(`✅ Fetched ${data.length} candles from ${assetType === 'crypto' ? 'Bybit' : 'Yahoo Finance'}`);
    return data as MarketData[];
  } catch (error) {
    console.error(`❌ Error fetching market data for ${symbol}:`, error);
    return null;
  }
}

// Build comprehensive trading state with technical indicators
async function buildTradingState(marketData: MarketData[], symbol: string): Promise<TradingState> {
  const prices = marketData.map(d => d.close);
  const volumes = marketData.map(d => d.volume);
  const highs = marketData.map(d => d.high);
  const lows = marketData.map(d => d.low);
  
  const currentPrice = prices[prices.length - 1];
  const currentVolume = volumes[volumes.length - 1];
  
  // Calculate EMA 200
  const ema200 = calculateEMA(prices, 200);
  
  // Calculate MACD
  const macd = calculateMACD(prices);
  
  // Calculate ATR
  const atr = calculateATR(highs, lows, prices, 14);
  
  // Calculate OBV
  const obv = calculateOBV(prices, volumes);
  
  // Calculate Bollinger Bands
  const bollinger = calculateBollingerBands(prices, 20, 2);
  
  // Calculate Ichimoku
  const ichimoku = calculateIchimoku(highs, lows, prices);
  
  // Detect market phase
  const marketPhase = detectMarketPhase(prices, volumes, {
    ichimoku,
    ema200,
    macd,
    atr,
    obv,
    bollinger
  });
  
  // Determine market condition
  let marketCondition: 'bullish' | 'bearish' | 'sideways' = 'sideways';
  if (currentPrice > ema200 && macd.histogram > 0) {
    marketCondition = 'bullish';
  } else if (currentPrice < ema200 && macd.histogram < 0) {
    marketCondition = 'bearish';
  }
  
  // Calculate volatility
  const avgPrice = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const priceStdDev = Math.sqrt(
    prices.slice(-20).reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / 20
  );
  const volatility = priceStdDev / avgPrice;
  
  // Simple confluence score
  const confluenceScore = (
    (currentPrice > ema200 ? 0.25 : 0) +
    (macd.histogram > 0 ? 0.25 : 0) +
    (bollinger.position > 0.3 && bollinger.position < 0.7 ? 0.25 : 0) +
    (obv > 0 ? 0.25 : 0)
  );
  
  return {
    price: currentPrice,
    volume: currentVolume,
    indicators: {
      ichimoku,
      ema200,
      macd,
      atr,
      obv,
      bollinger,
      fibonacci: { levels: [Math.max(...prices.slice(-50)), Math.min(...prices.slice(-50))] }
    },
    marketCondition,
    volatility,
    confluenceScore,
    historicalPerformance: prices.slice(-30),
    marketPhase
  };
}

// Technical indicator calculations
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] * k) + (ema * (1 - k));
  }
  return ema;
}

function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  
  const macdValues = [];
  for (let i = 26; i < prices.length; i++) {
    const slice = prices.slice(0, i + 1);
    const e12 = calculateEMA(slice, 12);
    const e26 = calculateEMA(slice, 26);
    macdValues.push(e12 - e26);
  }
  const signal = calculateEMA(macdValues, 9);
  
  return {
    macd,
    signal,
    histogram: macd - signal
  };
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
  const trueRanges = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateOBV(prices: number[], volumes: number[]): number {
  let obv = 0;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) {
      obv += volumes[i];
    } else if (prices[i] < prices[i - 1]) {
      obv -= volumes[i];
    }
  }
  return obv;
}

function calculateBollingerBands(prices: number[], period: number, stdDev: number): { upper: number; middle: number; lower: number; position: number } {
  const slice = prices.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(
    slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period
  );
  const upper = middle + (std * stdDev);
  const lower = middle - (std * stdDev);
  const currentPrice = prices[prices.length - 1];
  const position = (currentPrice - lower) / (upper - lower);
  
  return { upper, middle, lower, position };
}

function calculateIchimoku(highs: number[], lows: number[], prices: number[]): { signal: number; cloud: any } {
  const tenkanPeriod = 9;
  const kijunPeriod = 26;
  
  const tenkanHigh = Math.max(...highs.slice(-tenkanPeriod));
  const tenkanLow = Math.min(...lows.slice(-tenkanPeriod));
  const tenkan = (tenkanHigh + tenkanLow) / 2;
  
  const kijunHigh = Math.max(...highs.slice(-kijunPeriod));
  const kijunLow = Math.min(...lows.slice(-kijunPeriod));
  const kijun = (kijunHigh + kijunLow) / 2;
  
  const currentPrice = prices[prices.length - 1];
  const signal = currentPrice > tenkan && tenkan > kijun ? 1 : 
                 currentPrice < tenkan && tenkan < kijun ? -1 : 0;
  
  return { signal, cloud: { tenkan, kijun } };
}

function calculatePositionSize(pref: any, currentPrice: number, stopLoss: number, asset: string): number {
  const maxExposure = pref.max_exposure_usd || 0;
  const isCrypto = asset.includes('USDT') || asset.includes('BTC') || asset.includes('ETH');
  
  // Risk per trade based on risk mode (percentage of equity to risk)
  const riskPerTradePct = {
    'low': 1.0,        // 1% risk per trade
    'medium': 1.5,     // 1.5% risk per trade
    'high': 2.0,       // 2% risk per trade
    'aggressive': 2.5, // 2.5% risk per trade
  }[pref.risk_mode] || 1.5;
  
  // Position size cap based on risk mode (percentage of equity as max position)
  const maxPositionSizePct = {
    'low': 10,
    'medium': 20,
    'high': 30,
    'aggressive': 40,
  }[pref.risk_mode] || 20;
  
  // ===== METHOD 1: Risk-Based Calculation =====
  // How much $ we're willing to lose on this trade
  const riskAmount = maxExposure * (riskPerTradePct / 100);
  const slDistance = Math.abs(currentPrice - stopLoss);
  const qtyFromRisk = slDistance > 0 ? riskAmount / slDistance : 0;
  
  // ===== METHOD 2: Position-Size-Based Calculation =====
  // Max $ exposure as percentage of equity
  const maxPositionValue = maxExposure * (maxPositionSizePct / 100);
  const qtyFromPositionSize = maxPositionValue / currentPrice;
  
  // ===== Take the SMALLER of the two (safer) =====
  let rawQty = Math.min(qtyFromRisk, qtyFromPositionSize);
  
  // Apply model's size multiplier if provided (from PPO inference)
  const sizeMultiplier = (pref as any).sizeMultiplier || 1.0;
  if (sizeMultiplier !== 1.0) {
    console.log(`🎯 Applying model size multiplier: ${sizeMultiplier.toFixed(3)}x`);
    rawQty *= sizeMultiplier;
  }
  
  // ===== SAFETY CAP: Crypto positions should never exceed 10% of equity =====
  if (isCrypto) {
    const maxCryptoValue = maxExposure * 0.10;
    const qtyFromCryptoCap = maxCryptoValue / currentPrice;
    if (rawQty > qtyFromCryptoCap) {
      console.warn(`⚠️  Crypto safety cap applied: ${rawQty.toFixed(8)} → ${qtyFromCryptoCap.toFixed(8)}`);
      rawQty = qtyFromCryptoCap;
    }
  }
  
  const finalQty = Math.floor(rawQty * 100000) / 100000; // Keep 5 decimals for crypto
  
  console.log(`💰 Position Size Calculation (${asset}):
    - Max Exposure (Equity): $${maxExposure.toLocaleString()}
    - Risk Mode: ${pref.risk_mode}
    
    METHOD 1: Risk-Based
    - Risk Per Trade: ${riskPerTradePct}% = $${riskAmount.toLocaleString()}
    - Entry Price: $${currentPrice.toLocaleString()}
    - Stop Loss: $${stopLoss.toLocaleString()}
    - SL Distance: $${slDistance.toLocaleString()} (${((slDistance / currentPrice) * 100).toFixed(2)}%)
    - Qty from Risk: ${qtyFromRisk.toFixed(8)} (Position Value: $${(qtyFromRisk * currentPrice).toLocaleString()})
    
    METHOD 2: Position-Size-Based
    - Max Position Size: ${maxPositionSizePct}% = $${maxPositionValue.toLocaleString()}
    - Qty from Position Size: ${qtyFromPositionSize.toFixed(8)} (Position Value: $${(qtyFromPositionSize * currentPrice).toLocaleString()})
    
    SELECTED: ${rawQty === qtyFromRisk ? 'RISK-BASED (safer)' : 'POSITION-SIZE-BASED (safer)'}
    - Size Multiplier: ${sizeMultiplier.toFixed(3)}x
    - Final Qty: ${finalQty.toFixed(8)}
    - Final Position Value: $${(finalQty * currentPrice).toLocaleString()} (${((finalQty * currentPrice / maxExposure) * 100).toFixed(2)}% of equity)`);
  
  if (finalQty === 0 || !isFinite(finalQty)) {
    console.error(`❌ Invalid qty calculated! max_exposure=${maxExposure}, price=${currentPrice}, stopLoss=${stopLoss}`);
    return 0;
  }
  
  return finalQty;
}

function normalizeQuantity(qty: number, minQty: number, stepSize: number): number {
  console.log(`🔧 Normalizing quantity:
    - Input Qty: ${qty}
    - Min Qty: ${minQty}
    - Step Size: ${stepSize}`);
  
  // If calculated qty is 0 or invalid, reject it
  if (qty === 0 || !isFinite(qty)) {
    console.error(`❌ Cannot normalize invalid qty=${qty}! Check position size calculation.`);
    return 0;
  }
  
  // **FIXED**: If calculated qty is less than minQty, reject it (don't force to minQty)
  if (qty < minQty) {
    console.error(`❌ Calculated qty (${qty}) is less than broker minimum (${minQty})!
      This indicates max_exposure_usd is too low for this asset.
      To fix: Increase max_exposure_usd in user preferences.`);
    return 0;
  }
  
  // Round down to nearest step size
  let normalized = qty;
  if (stepSize > 0) {
    normalized = Math.floor(qty / stepSize) * stepSize;
  }
  
  // Ensure we still meet minimum after rounding
  if (normalized < minQty) {
    console.error(`❌ After rounding to step size, qty (${normalized}) is below minimum (${minQty})`);
    return 0;
  }
  
  console.log(`✅ Normalized Qty: ${normalized}`);
  
  return normalized;
}

async function queueSignalExecution(signal: any, pref: any) {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    console.log(`Queueing signal ${signal.id} for VPS execution`);
    
    // Call execute-signal edge function to send to VPS
    const { data, error } = await supabaseClient.functions.invoke('execute-signal', {
      body: { signal_id: signal.id }
    });
    
    if (error) {
      console.error(`❌ Failed to queue signal ${signal.id}:`, error);
    } else {
      console.log(`✅ Successfully queued signal ${signal.id} for execution`);
    }
  } catch (error) {
    console.error(`❌ Error queueing signal ${signal.id}:`, error);
  }
}
