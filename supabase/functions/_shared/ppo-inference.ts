// PPO Model Inference for Trading Signals
import { forwardPass, RecurrentPPOModel, HybridAction } from './recurrent-ppo-model.ts';
import { TradingEnvironment } from './trading-environment.ts';

export interface MarketData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PPOInferenceResult {
  action: HybridAction;
  value: number;
  confidence: number;
  featureCount: number;
  sequenceLength: number;
}

/**
 * Run PPO model inference on market data
 * 
 * @param modelWeights - Trained RecurrentPPOModel weights
 * @param marketData - Array of OHLCV candles (minimum 200 for proper feature extraction)
 * @param deterministicMode - If true, uses mode/mean instead of sampling
 * @returns PPO inference result with action, value, and confidence
 */
export async function runPPOInference(
  modelWeights: RecurrentPPOModel,
  marketData: MarketData[],
  deterministicMode: boolean = true
): Promise<PPOInferenceResult> {
  console.log(`🧠 Running PPO inference on ${marketData.length} candles`);

  // Validate we have enough market data
  if (marketData.length < 200) {
    throw new Error(`Insufficient market data: need 200+ candles, got ${marketData.length}`);
  }

  // Validate model weights structure
  if (!modelWeights.lstm_weights || !modelWeights.actor_direction) {
    throw new Error('Invalid model weights: missing required neural network parameters');
  }

  const featureSize = modelWeights.feature_size || 25;
  const sequenceLength = modelWeights.sequence_length || 50;

  console.log(`📊 Model architecture: ${sequenceLength} sequence × ${featureSize} features`);

  // Create TradingEnvironment to extract features
  // Use the same config as training for consistency
  const envConfig = {
    initialEquity: 100000,
    maxLeverage: 1,
    maxPositionSize: 0.95,
    maxDailyLoss: 0.05,
    maxDrawdown: 0.15,
    pointValue: 1.0,
    fees: { min: 0.0002, max: 0.001 },
    slippage: { min: 0.0001, max: 0.0005 },
    spread: { min: 0.00005, max: 0.0002 }
  };

  // Determine feature config based on model's feature_size
  let featureMode: 'mini' | 'basic' | 'with_sr' | 'large' | 'full' = 'full';
  if (featureSize === 12) featureMode = 'mini';
  else if (featureSize === 15) featureMode = 'basic';
  else if (featureSize === 22) featureMode = 'with_sr';
  else if (featureSize === 25) featureMode = 'large';
  else if (featureSize === 31) featureMode = 'full';

  console.log(`🔧 Using feature mode: ${featureMode} (${featureSize} features)`);

  // Initialize environment with full market data
  const env = new TradingEnvironment(marketData, envConfig, featureMode);

  // Reset to get initial state
  env.reset();

  // Extract feature sequence (50 bars × 25 features)
  const featureSequence = env.getSequence(sequenceLength);

  // Validate feature sequence shape
  if (featureSequence.length !== sequenceLength) {
    throw new Error(`Invalid sequence length: expected ${sequenceLength}, got ${featureSequence.length}`);
  }

  if (featureSequence[0].length !== featureSize) {
    throw new Error(`Invalid feature size: expected ${featureSize}, got ${featureSequence[0].length}`);
  }

  console.log(`✅ Feature extraction complete: [${featureSequence.length}, ${featureSequence[0].length}]`);

  // Log feature statistics for debugging
  const firstFeatures = featureSequence[0];
  const minFeature = Math.min(...firstFeatures);
  const maxFeature = Math.max(...firstFeatures);
  const avgFeature = firstFeatures.reduce((a, b) => a + b, 0) / firstFeatures.length;
  
  console.log(`📈 Feature stats (first bar): min=${minFeature.toFixed(4)}, max=${maxFeature.toFixed(4)}, avg=${avgFeature.toFixed(4)}`);

  // Run forward pass through neural network
  console.log(`🔮 Running forward pass (deterministic=${deterministicMode})...`);
  
  const result = forwardPass(modelWeights, featureSequence, deterministicMode);

  // Calculate confidence from value and action probabilities
  // Higher absolute value = more confident prediction
  const confidence = Math.min(1.0, Math.abs(result.value) / 10.0);

  console.log(`✅ PPO Inference Result:
    - Direction: ${result.action.direction} (0=flat, 1=long, 2=short)
    - Size: ${result.action.size.toFixed(4)} (0-1 scale)
    - TP Multiplier: ${result.action.tp_multiplier.toFixed(4)}x ATR [1.2-2.0]
    - SL Multiplier: ${result.action.sl_multiplier.toFixed(4)}x ATR [0.8-1.2]
    - Value: ${result.value.toFixed(4)}
    - Confidence: ${(confidence * 100).toFixed(1)}%`);

  return {
    action: result.action,
    value: result.value,
    confidence,
    featureCount: featureSize,
    sequenceLength
  };
}

/**
 * Convert PPO action to trading signal type
 */
export function ppoActionToSignalType(direction: number): 'BUY' | 'SELL' | 'HOLD' {
  if (direction === 1) return 'BUY';
  if (direction === 2) return 'SELL';
  return 'HOLD';
}
