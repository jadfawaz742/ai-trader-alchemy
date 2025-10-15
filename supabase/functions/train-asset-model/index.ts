import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { fetchMarketData as fetchUnifiedData, type MarketDataPoint } from '../_shared/market-data-fetcher.ts';
import { TrainingRequestSchema, validateInput, createValidationErrorResponse } from '../_shared/validation-schemas.ts';
import { initializeModel, forwardPass, serializeModel } from '../_shared/recurrent-ppo-model.ts';
import { TradingEnvironment } from '../_shared/trading-environment.ts';
import { PPOTrainer, ExperienceBuffer } from '../_shared/ppo-trainer.ts';
import { extractStructuralFeatures } from '../_shared/structural-features.ts';
import { calculateTechnicalIndicators } from '../_shared/technical-indicators.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Adaptive training configuration based on data size
function getTrainingConfig(dataSize: number) {
  if (dataSize < 200) {
    return {
      curriculum_stage: 'basic',
      features: 15, // technicals only
      sequence_length: 30,
      episodes: 50,
      enable_action_masking: false,
      enable_structural: false
    };
  } else if (dataSize < 500) {
    return {
      curriculum_stage: 'with_sr',
      features: 22, // technicals + S/R + regime
      sequence_length: 40,
      episodes: 100,
      enable_action_masking: false,
      enable_structural: true
    };
  } else {
    return {
      curriculum_stage: 'full',
      features: 31, // all features
      sequence_length: 50,
      episodes: 200,
      enable_action_masking: true,
      enable_structural: true
    };
  }
}

// Data augmentation for small datasets
function augmentData(data: OHLCV[], targetSize: number): OHLCV[] {
  if (data.length >= targetSize) return data;
  
  const augmented = [...data];
  while (augmented.length < targetSize) {
    const randomBar = data[Math.floor(Math.random() * data.length)];
    const noise = 0.995 + Math.random() * 0.01; // ±0.5% noise
    augmented.push({
      timestamp: randomBar.timestamp + (augmented.length * 86400000),
      open: randomBar.open * noise,
      high: randomBar.high * noise,
      low: randomBar.low * noise,
      close: randomBar.close * noise,
      volume: randomBar.volume * (0.9 + Math.random() * 0.2)
    });
  }
  return augmented;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header provided' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const isServiceRole = token === serviceRoleKey;
    
    let userId: string;
    let supabaseClient;
    let requestBody;
    
    if (isServiceRole) {
      console.log('🔑 Service role authentication detected');
      supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        serviceRoleKey ?? '',
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );
      
      requestBody = await req.json();
      userId = requestBody.user_id;
      
      if (!userId) {
        return new Response(
          JSON.stringify({ error: 'user_id required for service role calls' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`Service role training for user: ${userId}`);
    } else {
      supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { 
          global: { 
            headers: { Authorization: authHeader }
          }
        }
      );
      
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      
      if (authError || !user) {
        console.error('Authentication error:', authError);
        return new Response(
          JSON.stringify({ error: 'Authentication failed. Please log in again.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      userId = user.id;
      console.log(`User ${userId} requesting training for symbol`);
      requestBody = await req.json();
    }

    let validatedData;
    try {
      validatedData = validateInput(TrainingRequestSchema, requestBody);
    } catch (error) {
      return createValidationErrorResponse(error as Error, corsHeaders);
    }

    const { symbol: normalizedSymbol, forceRetrain } = validatedData;
    const useAugmentation = requestBody.use_augmentation || false;
    console.log(`Training model for asset: ${normalizedSymbol} (forceRetrain: ${forceRetrain}, augmentation: ${useAugmentation})`);

    // Check if model already exists
    const { data: existingModel, error: checkError } = await supabaseClient
      .from('asset_models')
      .select('id, created_at, performance_metrics')
      .eq('user_id', userId)
      .eq('symbol', normalizedSymbol)
      .maybeSingle();

    if (existingModel && !forceRetrain) {
      console.log(`⏭️ Model already exists for ${normalizedSymbol}, skipping`);
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          symbol: normalizedSymbol,
          message: `Model already exists for ${normalizedSymbol}`,
          existingModel: {
            id: existingModel.id,
            createdAt: existingModel.created_at,
            metrics: existingModel.performance_metrics
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingModel && forceRetrain) {
      console.log(`🔄 Force retraining ${normalizedSymbol} - deleting old model`);
      await supabaseClient
        .from('asset_models')
        .delete()
        .eq('id', existingModel.id);
    }

    // Fetch historical data
    const historicalData = await fetchHistoricalData(normalizedSymbol);
    
    // Adaptive training based on data size
    const minDataPoints = useAugmentation ? 30 : 50;
    if (historicalData.length < minDataPoints) {
      throw new Error(`Insufficient data for ${normalizedSymbol}. Need at least ${minDataPoints} data points, got ${historicalData.length}.`);
    }

    let trainingData = historicalData;
    const config = getTrainingConfig(historicalData.length);
    
    // Apply data augmentation if requested and needed
    if (useAugmentation && historicalData.length < 50) {
      console.log(`📊 Augmenting data from ${historicalData.length} to 50 bars`);
      trainingData = augmentData(historicalData, 50);
    }

    console.log(`📋 Training config: ${config.curriculum_stage} stage, ${config.features} features, ${config.episodes} episodes`);

    // Determine asset type
    const assetType = normalizedSymbol.includes('USD') || normalizedSymbol.includes('-USD') 
      ? 'crypto' 
      : 'stock';

    // Split data for training and testing
    const splitIndex = Math.floor(trainingData.length * 0.8);
    const trainData = trainingData.slice(0, splitIndex);
    const testData = trainingData.slice(splitIndex);

    // Train comprehensive PPO model
    const result = await trainComprehensivePPO(
      normalizedSymbol,
      trainData,
      testData,
      config,
      supabaseClient
    );

    // Save the trained model
    const { data: insertedModel, error: insertError } = await supabaseClient
      .from('asset_models')
      .insert({
        user_id: userId,
        symbol: normalizedSymbol,
        model_type: 'recurrent_ppo',
        model_architecture: 'recurrent_ppo',
        model_weights: result.model_weights,
        action_space: {
          direction: 3,
          tp_offset: [-0.5, 0.5],
          sl_tight: [0.5, 2.0],
          size: [0.0, 1.0]
        },
        hidden_size: 128,
        sequence_length: config.sequence_length,
        curriculum_stage: config.curriculum_stage,
        training_data_points: trainingData.length,
        structural_features: result.structural_metadata,
        performance_metrics: result.performance_metrics,
        fine_tuning_metadata: {
          asset_type: assetType,
          data_augmented: useAugmentation && historicalData.length < 50,
          original_data_points: historicalData.length,
          train_size: trainData.length,
          test_size: testData.length,
          episodes_trained: config.episodes
        }
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    console.log(`✅ Model trained successfully for ${normalizedSymbol}`);

    return new Response(
      JSON.stringify({
        success: true,
        symbol: normalizedSymbol,
        assetType,
        curriculum_stage: config.curriculum_stage,
        dataPoints: trainingData.length,
        metrics: result.performance_metrics,
        model_id: insertedModel.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error training asset model:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchHistoricalData(symbol: string): Promise<OHLCV[]> {
  console.log(`📡 Fetching training data for ${symbol}...`);
  
  try {
    const data = await fetchUnifiedData({
      symbol,
      range: '2y',
      interval: '1d'
    });
    
    return data.map((d: MarketDataPoint) => ({
      timestamp: d.timestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume
    }));
  } catch (error) {
    console.error(`❌ Error fetching training data:`, error);
    throw error;
  }
}

async function trainComprehensivePPO(
  symbol: string,
  trainData: OHLCV[],
  testData: OHLCV[],
  config: any,
  supabaseClient: any
) {
  // Initialize recurrent PPO model
  const model = initializeModel(config.features, 128, config.sequence_length);
  
  // Create trading environment with domain randomization
  const env = new TradingEnvironment(trainData, {
    initialBalance: 100000,
    maxPositions: 1,
    feesRange: [0.0004, 0.001],
    slippageRange: [0.0001, 0.0005],
    enableActionMasking: config.enable_action_masking,
    enableStructuralFeatures: config.enable_structural,
    sequenceLength: config.sequence_length
  });
  
  // Initialize PPO trainer
  const trainer = new PPOTrainer(model, {
    gamma: 0.99,
    gae_lambda: 0.95,
    clip_epsilon: 0.2,
    entropy_coef: 0.01,
    learningRate: 3e-4,
    batchSize: 64,
    epochs: 4
  });
  
  // Training metrics
  const metrics = {
    episodes: [],
    longTrades: 0,
    shortTrades: 0,
    longWins: 0,
    shortWins: 0,
    confluenceScores: [],
    fibAlignments: [],
    tpDistances: [],
    slDistances: []
  };
  
  // Training loop
  for (let episode = 0; episode < config.episodes; episode++) {
    const buffer = trainer.createBuffer();
    const state = env.reset();
    let done = false;
    let episodeReward = 0;
    let episodeTrades = 0;
    
    while (!done) {
      const { action, value, logProb } = forwardPass(model, [state.features], false);
      const { nextState, reward, done: isDone, info } = env.step(action);
      
      buffer.store({
        state: state.features,
        action,
        reward,
        value,
        logProb,
        done: isDone
      });
      
      // Track metrics
      if (info.trade_executed) {
        episodeTrades++;
        if (action.direction === 1) metrics.longTrades++;
        else if (action.direction === 2) metrics.shortTrades++;
        
        if (info.confluence_score) metrics.confluenceScores.push(info.confluence_score);
        if (info.fib_alignment) metrics.fibAlignments.push(info.fib_alignment);
        if (info.tp_distance_atr) metrics.tpDistances.push(info.tp_distance_atr);
        if (info.sl_distance_atr) metrics.slDistances.push(info.sl_distance_atr);
      }
      
      if (info.trade_closed && info.pnl > 0) {
        if (info.side === 'long') metrics.longWins++;
        else metrics.shortWins++;
      }
      
      state.features = nextState.features;
      episodeReward += reward;
      done = isDone;
    }
    
    // Calculate advantages
    const advantages = trainer.computeGAE(buffer);
    buffer.setAdvantages(advantages);
    
    // Update policy every 4 episodes
    if ((episode + 1) % 4 === 0) {
      const trainingMetrics = trainer.updateModel(buffer, advantages);
      console.log(`Episode ${episode + 1}/${config.episodes}: reward=${episodeReward.toFixed(2)}, trades=${episodeTrades}`);
    }
    
    metrics.episodes.push({
      episode,
      reward: episodeReward,
      pnl: env.getMetrics().totalPnL,
      trades: episodeTrades
    });
  }
  
  // Calculate final metrics
  const envMetrics = env.getMetrics();
  const totalTrades = metrics.longTrades + metrics.shortTrades;
  
  return {
    model_weights: serializeModel(model),
    performance_metrics: {
      totalTrades,
      winRate: totalTrades > 0 ? (metrics.longWins + metrics.shortWins) / totalTrades : 0,
      longWinRate: metrics.longTrades > 0 ? metrics.longWins / metrics.longTrades : 0,
      shortWinRate: metrics.shortTrades > 0 ? metrics.shortWins / metrics.shortTrades : 0,
      longPayoffRatio: envMetrics.longPayoffRatio || 0,
      shortPayoffRatio: envMetrics.shortPayoffRatio || 0,
      sharpeRatio: envMetrics.sharpeRatio || 0,
      maxDrawdown: envMetrics.maxDrawdown || 0,
      totalReturn: envMetrics.totalReturn || 0,
      avgConfluence: metrics.confluenceScores.length > 0 
        ? metrics.confluenceScores.reduce((a, b) => a + b, 0) / metrics.confluenceScores.length 
        : 0,
      fibAlignmentRatio: metrics.fibAlignments.length > 0
        ? metrics.fibAlignments.filter(f => f > 0.8).length / metrics.fibAlignments.length
        : 0,
      avgTPDistanceATR: metrics.tpDistances.length > 0
        ? metrics.tpDistances.reduce((a, b) => a + b, 0) / metrics.tpDistances.length
        : 0,
      avgSLDistanceATR: metrics.slDistances.length > 0
        ? metrics.slDistances.reduce((a, b) => a + b, 0) / metrics.slDistances.length
        : 0
    },
    structural_metadata: {
      regimes_encountered: envMetrics.regimeStats || {},
      sr_usage: envMetrics.srUsageStats || {},
      fib_targets_hit: envMetrics.fibStats || {}
    }
  };
}
