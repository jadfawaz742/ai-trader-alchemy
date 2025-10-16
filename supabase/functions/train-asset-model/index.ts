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
      episodes: 20, // ✅ Reduced for edge function CPU limits
      enable_action_masking: false,
      enable_structural: false
    };
  } else if (dataSize < 500) {
    return {
      curriculum_stage: 'with_sr',
      features: 22, // technicals + S/R + regime
      sequence_length: 40,
      episodes: 30, // ✅ Reduced for edge function CPU limits
      enable_action_masking: false,
      enable_structural: true
    };
  } else {
    return {
      curriculum_stage: 'full',
      features: 31, // all features
      sequence_length: 50,
      episodes: 40, // ✅ Significantly reduced for edge function CPU limits
      enable_action_masking: true,
      enable_structural: true
    };
  }
}

// CPU timeout protection (edge functions have 60s limit)
const MAX_TRAINING_TIME_MS = 50000; // 50 seconds (leave 10s buffer)

// Data augmentation for small datasets
function augmentData(data: OHLCV[], targetSize: number): OHLCV[] {
  if (data.length >= targetSize) return data;
  
  const augmented = [...data];
  const neededDuplicates = targetSize - data.length;
  
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
  
  // Validate augmentation
  if (augmented.length !== targetSize) {
    throw new Error(`Augmentation failed: expected ${targetSize} bars, got ${augmented.length}`);
  }
  
  console.log(`✅ Augmented ${data.length} bars to ${augmented.length} bars (added ${neededDuplicates})`);
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
    
    // Auto-enable augmentation for datasets with 30-200 bars
    const shouldAugment = useAugmentation || (historicalData.length >= 30 && historicalData.length < 200);
    const minDataPoints = shouldAugment ? 30 : 50;
    
    if (historicalData.length < minDataPoints) {
      throw new Error(`Insufficient data for ${normalizedSymbol}. Need at least ${minDataPoints} data points, got ${historicalData.length}.`);
    }

    let trainingData = historicalData;
    const config = getTrainingConfig(historicalData.length);
    
    // Apply data augmentation if needed
    if (shouldAugment && historicalData.length < 200) {
      const targetSize = Math.min(200, historicalData.length * 3);
      console.log(`📊 Auto-augmenting data from ${historicalData.length} to ${targetSize} bars`);
      trainingData = augmentData(historicalData, targetSize);
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

    // Check for existing model and determine version
    const { data: activeModel } = await supabaseClient
      .from('asset_models')
      .select('id, model_version, model_storage_path')
      .eq('user_id', userId)
      .eq('symbol', normalizedSymbol)
      .eq('model_status', 'active')
      .single();

    const newVersion = activeModel ? activeModel.model_version + 1 : 1;

    // Generate storage paths
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const assetFolder = `${userId}/${assetType}/${normalizedSymbol}`;
    const modelFileName = `v${newVersion}_${timestamp}.json`;
    const metadataFileName = `v${newVersion}_${timestamp}.meta`;
    const modelPath = `${assetFolder}/${modelFileName}`;
    const metadataPath = `${assetFolder}/${metadataFileName}`;

    console.log(`📁 Uploading model to storage: ${modelPath}`);

    // Upload model weights to storage
    const modelBlob = new Blob(
      [JSON.stringify(result.model_weights, null, 2)], 
      { type: 'application/json' }
    );
    const { error: uploadError } = await supabaseClient
      .storage
      .from('trained-models')
      .upload(modelPath, modelBlob, {
        contentType: 'application/json',
        upsert: false
      });

    if (uploadError) {
      console.error('❌ Failed to upload model:', uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Upload training metadata
    const metadataBlob = new Blob(
      [JSON.stringify({
        symbol: normalizedSymbol,
        asset_type: assetType,
        version: newVersion,
        training_config: config,
        training_logs: result.training_logs,
        structural_metadata: result.structural_metadata,
        performance_metrics: result.performance_metrics,
        timestamp: new Date().toISOString()
      }, null, 2)],
      { type: 'application/json' }
    );

    await supabaseClient
      .storage
      .from('trained-models')
      .upload(metadataPath, metadataBlob, {
        contentType: 'application/json',
        upsert: false
      });

    console.log(`✅ Model uploaded successfully: ${modelPath}`);

    // Archive old model if exists
    if (activeModel) {
      console.log(`📦 Archiving old model v${activeModel.model_version}`);
      await supabaseClient
        .from('asset_models')
        .update({ model_status: 'archived' })
        .eq('id', activeModel.id);
    }

    // Save metadata to database (without model_weights)
    const { data: insertedModel, error: insertError } = await supabaseClient
      .from('asset_models')
      .insert({
        user_id: userId,
        symbol: normalizedSymbol,
        model_type: 'recurrent_ppo',
        model_architecture: 'recurrent_ppo',
        model_storage_path: modelPath,
        metadata_storage_path: metadataPath,
        model_version: newVersion,
        model_status: 'active',
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
          data_augmented: shouldAugment && historicalData.length < 200,
          augmentation_ratio: shouldAugment ? trainingData.length / historicalData.length : 1,
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

    console.log(`✅ Model v${newVersion} saved successfully for ${normalizedSymbol}`);

    // Trigger walk-forward validation automatically with comprehensive logging
    console.log('═══════════════════════════════════════════════════');
    console.log('🔍 STARTING WALK-FORWARD VALIDATION');
    console.log('═══════════════════════════════════════════════════');
    
    let validationTriggered = false;
    let validationApproved = false;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const validationUrl = `${supabaseUrl}/functions/v1/validate-model`;
    
    console.log(`📍 Validation URL: ${validationUrl}`);
    console.log(`📍 Model ID: ${insertedModel.id}`);
    console.log(`📍 Asset: ${normalizedSymbol}`);
    
    try {
      const validationStartDate = new Date();
      validationStartDate.setMonth(validationStartDate.getMonth() - 6);
      
      const validationPayload = {
        modelId: insertedModel.id,
        asset: normalizedSymbol,
        startDate: validationStartDate.toISOString(),
        endDate: new Date().toISOString()
      };
      
      console.log('📦 Validation payload:', JSON.stringify(validationPayload, null, 2));
      console.log('🚀 Initiating validation request...');
      
      // Create abort controller for 30 second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error('⏰ Validation timeout - aborting request after 30 seconds');
        controller.abort();
      }, 30000);
      
      const validationResponse = await fetch(validationUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validationPayload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log(`📊 Validation response status: ${validationResponse.status}`);
      console.log(`📊 Validation response headers:`, Object.fromEntries(validationResponse.headers.entries()));
      
      const validationText = await validationResponse.text();
      console.log(`📄 Validation response body (first 500 chars): ${validationText.substring(0, 500)}`);
      
      if (validationResponse.ok) {
        try {
          const validationResult = JSON.parse(validationText);
          validationTriggered = true;
          validationApproved = validationResult.approved || false;
          
          console.log('═══════════════════════════════════════════════════');
          console.log(`✅ VALIDATION COMPLETED: ${validationApproved ? 'APPROVED ✓' : 'NOT APPROVED ✗'}`);
          console.log('═══════════════════════════════════════════════════');
          console.log('Validation results:', JSON.stringify(validationResult, null, 2));
        } catch (parseError) {
          console.error('❌ Failed to parse validation response as JSON:', parseError);
          console.error('Raw response text:', validationText);
        }
      } else {
        console.error('═══════════════════════════════════════════════════');
        console.error(`❌ VALIDATION FAILED: HTTP ${validationResponse.status}`);
        console.error('═══════════════════════════════════════════════════');
        console.error('Error response:', validationText);
      }
    } catch (validationError) {
      if (validationError.name === 'AbortError') {
        console.error('═══════════════════════════════════════════════════');
        console.error('❌ VALIDATION TIMEOUT after 30 seconds');
        console.error('═══════════════════════════════════════════════════');
      } else {
        console.error('═══════════════════════════════════════════════════');
        console.error('❌ VALIDATION ERROR:', validationError);
        console.error('═══════════════════════════════════════════════════');
        console.error('Error details:', {
          name: validationError.name,
          message: validationError.message,
          stack: validationError.stack
        });
      }
      // Don't fail the training if validation fails - just log it
    }

    return new Response(
      JSON.stringify({
        success: true,
        symbol: normalizedSymbol,
        assetType,
        curriculum_stage: config.curriculum_stage,
        dataPoints: trainingData.length,
        metrics: result.performance_metrics,
        model_id: insertedModel.id,
        validation_triggered: validationTriggered,
        validation_approved: validationApproved
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
  
  // Create trading environment with domain randomization and feature config
  const env = new TradingEnvironment(
    trainData,
    {
      initialBalance: 100000,
      maxPositions: 1,
      feesRange: [0.0004, 0.001],
      slippageRange: [0.0001, 0.0005],
      enableActionMasking: config.enable_action_masking,
      enableStructuralFeatures: config.enable_structural,
      sequenceLength: config.sequence_length
    },
    { features: config.features, enableStructural: config.enable_structural }
  );
  
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
  
  // Training loop with comprehensive logging and timeout protection
  console.log(`🎯 Starting training: ${config.episodes} episodes`);
  const startTime = Date.now();
  
  for (let episode = 0; episode < config.episodes; episode++) {
    // ✅ TIMEOUT CHECK - prevent edge function CPU timeout
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_TRAINING_TIME_MS) {
      console.log(`⏰ Training timeout after ${episode} episodes (${(elapsed/1000).toFixed(1)}s). Stopping early.`);
      break;
    }
    
    const buffer = trainer.createBuffer();
    let sequenceFeatures = env.reset();
    let done = false;
    let episodeReward = 0;
    let episodeTrades = 0;
    let steps = 0;
    
    while (!done) {
      // Bounds check before stepping
      if (env['state'].currentBar >= trainData.length - 1) {
        console.log(`Episode ${episode}: Reached end of data at bar ${env['state'].currentBar}`);
        done = true;
        break;
      }
      
      // ✅ FIX: Change logProb to logProbs (interface mismatch)
      const { action, value, logProbs } = forwardPass(model, sequenceFeatures, false);
      const { nextState, reward, done: isDone, info } = env.step(action);
      
      // ✅ FIX: Compute nextValue for GAE
      const nextValueResult = isDone ? 0 : forwardPass(model, nextState, true).value;
      
      buffer.store({
        state: sequenceFeatures,
        action,
        reward,
        value,
        logProbs, // ✅ FIX: Use logProbs (plural)
        done: isDone,
        nextState, // ✅ FIX: Add nextState
        nextValue: nextValueResult // ✅ FIX: Add nextValue
      });
      
      // ✅ FIX: Correct info property access (info.trade instead of info.trade_executed)
      if (info.trade) {
        episodeTrades++;
        const trade = info.trade;
        
        if (trade.direction === 'long') metrics.longTrades++;
        else if (trade.direction === 'short') metrics.shortTrades++;
        
        if (trade.confluenceScore) metrics.confluenceScores.push(trade.confluenceScore);
        if (trade.fibAlignment) metrics.fibAlignments.push(trade.fibAlignment);
        if (trade.tpDistance) metrics.tpDistances.push(trade.tpDistance);
        if (trade.slDistance) metrics.slDistances.push(trade.slDistance);
        
        // Track wins (trade is only returned when closed)
        if (trade.pnl > 0) {
          if (trade.direction === 'long') metrics.longWins++;
          else metrics.shortWins++;
        }
      }
      
      sequenceFeatures = nextState;
      episodeReward += reward;
      done = isDone;
      steps++;
      
      // ✅ ADD: Step-level logging every 50 steps
      if (steps % 50 === 0) {
        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  Episode ${episode}/${config.episodes}, Step ${steps}: reward=${episodeReward.toFixed(2)}, equity=${info.equity?.toFixed(0) || 'N/A'} (${elapsedSeconds}s)`);
      }
    }
    
    // Calculate advantages
    const advantages = trainer.computeGAE(buffer);
    buffer.setAdvantages(advantages);
    
    // ✅ FIX: Update policy every 8 episodes (reduce CPU load)
    if ((episode + 1) % 8 === 0) {
      const updateStart = Date.now();
      const trainingMetrics = trainer.updateModel(buffer, advantages);
      const updateTime = ((Date.now() - updateStart) / 1000).toFixed(2);
      const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const avgTimePerEpisode = ((Date.now() - startTime) / (episode + 1) / 1000).toFixed(2);
      const estimatedRemaining = (parseFloat(avgTimePerEpisode) * (config.episodes - episode - 1) / 60).toFixed(1);
      
      console.log(`✅ Episode ${episode + 1}/${config.episodes}: reward=${episodeReward.toFixed(2)}, trades=${episodeTrades}, update_time=${updateTime}s, elapsed=${totalElapsed}s, ETA=${estimatedRemaining}m`);
    }
    
    metrics.episodes.push({
      episode,
      reward: episodeReward,
      pnl: env.getMetrics().total_reward, // ✅ FIX: Use correct property name
      trades: episodeTrades
    });
  }
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  console.log(`🎉 Training completed in ${totalTime} minutes`);
  
  // Calculate final metrics
  const envMetrics = env.getMetrics();
  const totalTrades = metrics.longTrades + metrics.shortTrades;
  
  // ✅ FIX: Calculate payoff ratios from env metrics
  const longPayoffRatio = envMetrics.long_trades > 0 
    ? Math.abs(envMetrics.avg_win / (envMetrics.avg_loss || -1))
    : 0;
  const shortPayoffRatio = envMetrics.short_trades > 0
    ? Math.abs(envMetrics.avg_win / (envMetrics.avg_loss || -1))
    : 0;
  
  return {
    model_weights: serializeModel(model),
    performance_metrics: {
      totalTrades,
      winRate: totalTrades > 0 ? (metrics.longWins + metrics.shortWins) / totalTrades : 0,
      longWinRate: metrics.longTrades > 0 ? metrics.longWins / metrics.longTrades : 0,
      shortWinRate: metrics.shortTrades > 0 ? metrics.shortWins / metrics.shortTrades : 0,
      longPayoffRatio,
      shortPayoffRatio,
      sharpeRatio: envMetrics.sharpe_ratio || 0, // ✅ FIX: Use correct property name
      maxDrawdown: envMetrics.max_drawdown || 0, // ✅ FIX: Use correct property name
      totalReturn: (envMetrics.final_equity - 100000) / 100000, // ✅ FIX: Calculate from equity
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
      confluence_avg: envMetrics.confluence_avg || 0, // ✅ FIX: Use correct property names
      fib_alignment_avg: envMetrics.fib_alignment_avg || 0,
      total_trades: envMetrics.total_trades
    }
  };
}
