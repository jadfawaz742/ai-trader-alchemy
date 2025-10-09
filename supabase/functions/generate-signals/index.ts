import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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

    // Get all active user preferences
    const { data: userPrefs, error: prefsError } = await supabaseClient
      .from('user_asset_prefs')
      .select(`
        *,
        broker_connections!inner(
          id,
          broker_id,
          status,
          encrypted_credentials
        )
      `)
      .eq('enabled', true)
      .eq('broker_connections.status', 'connected');

    if (prefsError) {
      console.error('Error fetching user preferences:', prefsError);
      throw prefsError;
    }

    console.log(`Processing ${userPrefs?.length || 0} active user/asset pairs`);

    const signalsGenerated = [];

    for (const pref of userPrefs || []) {
      try {
        // Load PPO model for this asset
        const { data: model } = await supabaseClient
          .from('models')
          .select('*')
          .eq('asset', pref.asset)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!model) {
          console.log(`No active model found for ${pref.asset}`);
          continue;
        }

        // Get broker symbol mapping
        const { data: symbolMap } = await supabaseClient
          .from('symbol_map')
          .select('broker_symbol')
          .eq('asset', pref.asset)
          .eq('broker_id', pref.broker_id)
          .single();

        const brokerSymbol = symbolMap?.broker_symbol || pref.asset;

        // Fetch market data (simplified - in production, use websocket subscriptions)
        const marketData = await fetchMarketData(brokerSymbol, pref.broker_id);
        
        if (!marketData) {
          console.log(`No market data for ${pref.asset}`);
          continue;
        }

        // Extract features from market data
        const features = extractFeatures(marketData);

        // Run PPO inference
        const signal = await runPPOInference(model, features, pref);

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
              model_version: model.version,
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
          console.log(`Generated ${signal.action} signal for ${pref.asset}`);

          // Queue signal for VPS execution (call execute-trade function)
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

async function fetchMarketData(symbol: string, brokerId: string): Promise<MarketData[] | null> {
  // Simplified mock - in production, fetch from broker's websocket or REST API
  // This would use the broker's credentials to fetch real-time data
  console.log(`Fetching market data for ${symbol} from broker ${brokerId}`);
  
  // Mock data for demonstration
  return [
    { close: 100, volume: 1000, timestamp: Date.now() - 60000 },
    { close: 101, volume: 1100, timestamp: Date.now() - 30000 },
    { close: 102, volume: 1200, timestamp: Date.now() },
  ];
}

function extractFeatures(marketData: MarketData[]): number[] {
  // Extract technical indicators as features for PPO model
  // This is simplified - production would include RSI, MACD, BB, etc.
  
  const prices = marketData.map(d => d.close);
  const volumes = marketData.map(d => d.volume);
  
  // Price momentum
  const momentum = prices[prices.length - 1] - prices[0];
  const momentumPct = momentum / prices[0];
  
  // Volume trend
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const volumeRatio = volumes[volumes.length - 1] / avgVolume;
  
  // Simple moving average
  const sma = prices.reduce((a, b) => a + b, 0) / prices.length;
  const priceToSma = prices[prices.length - 1] / sma;
  
  return [
    momentumPct,
    volumeRatio,
    priceToSma,
    prices[prices.length - 1] / 100, // Normalized price
  ];
}

async function runPPOInference(
  model: PPOModel, 
  features: number[], 
  pref: any
): Promise<any> {
  // Simplified PPO inference
  // In production, load actual model weights and run forward pass
  
  console.log(`Running PPO inference for ${model.asset} v${model.version}`);
  
  // Mock action selection based on features
  const actionScore = features.reduce((a, b) => a + b, 0);
  
  let action = 'HOLD';
  let confidence = 0;
  
  if (actionScore > 1.05) {
    action = 'BUY';
    confidence = Math.min((actionScore - 1.05) * 100, 95);
  } else if (actionScore < 0.95) {
    action = 'SELL';
    confidence = Math.min((0.95 - actionScore) * 100, 95);
  }
  
  if (confidence < 65) {
    action = 'HOLD';
  }
  
  if (action === 'HOLD') return null;
  
  // Calculate position size based on risk mode
  const riskMultiplier = {
    'low': 0.5,
    'medium': 1.0,
    'high': 1.5,
  }[pref.risk_mode] || 1.0;
  
  const qty = Math.floor(pref.max_exposure_usd / features[3] * riskMultiplier);
  
  return {
    action,
    qty,
    order_type: 'MARKET',
    tp: features[3] * 1.03, // 3% take profit
    sl: features[3] * 0.98, // 2% stop loss
    confidence,
  };
}

function normalizeQuantity(qty: number, minQty: number, stepSize: number): number {
  const normalized = Math.max(qty, minQty);
  return Math.floor(normalized / stepSize) * stepSize;
}

async function queueSignalExecution(signal: any, pref: any) {
  // This will be called by the execute-trade edge function
  // For now, just log
  console.log(`Queueing signal ${signal.id} for execution`);
}
