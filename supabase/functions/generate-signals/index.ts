import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { makeAITradingDecision, detectMarketPhase, type TradingState } from "./shared-decision-logic.ts";
import { fetchMultiTimeframeData, analyzeMultiTimeframe, getMultiTimeframeBoost } from "./multi-timeframe.ts";
import { fetchMarketData as fetchUnifiedData, type MarketDataPoint } from "../_shared/market-data-fetcher.ts";
import { isCryptoSymbol, getAssetType } from "../_shared/symbol-utils.ts";

// Force redeploy to pick up 25-feature extraction fix in trading-environment.ts
const FEATURE_FIX_VERSION = '2.0.0';
console.log(`🔧 generate-signals v${FEATURE_FIX_VERSION} - 25-feature extraction enabled`);

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

        // Run AI trading decision with full market analysis (enableShorts = true)
        const decision = await makeAITradingDecision(tradingState, pref.asset, true, modelWeights);
        
        console.log(`Decision for ${pref.asset}: ${decision.type} (confidence: ${decision.confidence.toFixed(1)}%)`);

        const signal = decision.type !== 'HOLD' ? {
          action: decision.type,
          qty: calculatePositionSize(pref, tradingState.price),
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

          // Normalize quantity to venue requirements
          const normalizedQty = normalizeQuantity(
            signal.qty,
            brokerAsset?.min_qty || 0,
            brokerAsset?.step_size || 1
          );

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
              limit_price: signal.limit_price,
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
      range: '6mo',
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

function calculatePositionSize(pref: any, currentPrice: number): number {
  const riskMultiplier = {
    'low': 0.5,
    'medium': 1.0,
    'high': 1.5,
  }[pref.risk_mode] || 1.0;
  
  return Math.floor((pref.max_exposure_usd / currentPrice) * riskMultiplier);
}

function normalizeQuantity(qty: number, minQty: number, stepSize: number): number {
  const normalized = Math.max(qty, minQty);
  return Math.floor(normalized / stepSize) * stepSize;
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
