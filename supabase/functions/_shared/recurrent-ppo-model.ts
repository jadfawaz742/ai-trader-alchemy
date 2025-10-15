// Recurrent PPO Model (LSTM-based)
// Simplified implementation for TypeScript/Deno

export interface HybridAction {
  direction: number; // 0=flat, 1=long, 2=short
  tp_offset: number; // [-0.5, 0.5] in ATR units
  sl_tight: number;  // [0.5, 2.0] multiplier
  size: number;      // [0.0, 1.0] fraction of risk budget
}

export interface RecurrentPPOModel {
  // LSTM weights (simplified)
  lstm_weights: number[][];
  lstm_biases: number[];
  
  // Actor heads
  actor_direction: number[][]; // → 3 logits
  actor_tp_mean: number[][];   // → 1
  actor_tp_std: number[][];    // → 1
  actor_sl_mean: number[][];   // → 1
  actor_sl_std: number[][];    // → 1
  actor_size_mean: number[][]; // → 1
  actor_size_std: number[][];  // → 1
  
  // Critic head
  critic_weights: number[][];
  critic_bias: number[];
  
  // Hyperparameters
  hidden_size: number;
  sequence_length: number;
  feature_size: number;
}

// Initialize model with random weights (Xavier initialization)
export function initializeModel(
  featureSize: number = 31,
  hiddenSize: number = 128,
  sequenceLength: number = 50
): RecurrentPPOModel {
  const xavier = (fanIn: number, fanOut: number) => {
    const limit = Math.sqrt(6 / (fanIn + fanOut));
    return () => (Math.random() * 2 - 1) * limit;
  };
  
  const createMatrix = (rows: number, cols: number, init: () => number) => {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, init)
    );
  };
  
  return {
    lstm_weights: createMatrix(featureSize + hiddenSize, hiddenSize * 4, xavier(featureSize + hiddenSize, hiddenSize)),
    lstm_biases: Array.from({ length: hiddenSize * 4 }, () => 0),
    
    actor_direction: createMatrix(hiddenSize, 3, xavier(hiddenSize, 3)),
    actor_tp_mean: createMatrix(hiddenSize, 1, xavier(hiddenSize, 1)),
    actor_tp_std: createMatrix(hiddenSize, 1, () => -1), // Log std, init to exp(-1) ≈ 0.37
    actor_sl_mean: createMatrix(hiddenSize, 1, xavier(hiddenSize, 1)),
    actor_sl_std: createMatrix(hiddenSize, 1, () => -1),
    actor_size_mean: createMatrix(hiddenSize, 1, xavier(hiddenSize, 1)),
    actor_size_std: createMatrix(hiddenSize, 1, () => -1),
    
    critic_weights: createMatrix(hiddenSize, 1, xavier(hiddenSize, 1)),
    critic_bias: [0],
    
    hidden_size: hiddenSize,
    sequence_length: sequenceLength,
    feature_size: featureSize
  };
}

// Matrix multiplication
function matmul(a: number[], b: number[][]): number[] {
  const result: number[] = [];
  for (let i = 0; i < b[0].length; i++) {
    let sum = 0;
    for (let j = 0; j < a.length; j++) {
      sum += a[j] * b[j][i];
    }
    result.push(sum);
  }
  return result;
}

// Sigmoid activation
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// Tanh activation
function tanh(x: number): number {
  return Math.tanh(x);
}

// Softmax
function softmax(logits: number[]): number[] {
  const maxLogit = Math.max(...logits);
  const exps = logits.map(l => Math.exp(l - maxLogit));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sumExps);
}

// Sample from categorical distribution
function sampleCategorical(probs: number[]): number {
  const rand = Math.random();
  let cumsum = 0;
  for (let i = 0; i < probs.length; i++) {
    cumsum += probs[i];
    if (rand < cumsum) return i;
  }
  return probs.length - 1;
}

// Sample from Gaussian
function sampleGaussian(mean: number, std: number): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

// Simplified LSTM step (single gate for demonstration)
function lstmStep(
  input: number[],
  prevHidden: number[],
  prevCell: number[],
  weights: number[][],
  biases: number[]
): { hidden: number[]; cell: number[] } {
  const hiddenSize = prevHidden.length;
  const combined = [...input, ...prevHidden];
  
  // Compute gates (simplified: i, f, g, o)
  const gates = matmul(combined, weights);
  
  const forget: number[] = [];
  const inputGate: number[] = [];
  const cellGate: number[] = [];
  const outputGate: number[] = [];
  
  for (let i = 0; i < hiddenSize; i++) {
    forget.push(sigmoid(gates[i] + biases[i]));
    inputGate.push(sigmoid(gates[hiddenSize + i] + biases[hiddenSize + i]));
    cellGate.push(tanh(gates[2 * hiddenSize + i] + biases[2 * hiddenSize + i]));
    outputGate.push(sigmoid(gates[3 * hiddenSize + i] + biases[3 * hiddenSize + i]));
  }
  
  // Update cell and hidden
  const newCell = prevCell.map((c, i) => forget[i] * c + inputGate[i] * cellGate[i]);
  const newHidden = newCell.map((c, i) => outputGate[i] * tanh(c));
  
  return { hidden: newHidden, cell: newCell };
}

// Forward pass through recurrent PPO
export function forwardPass(
  model: RecurrentPPOModel,
  sequenceFeatures: number[][], // [sequenceLength, featureSize]
  deterministicMode: boolean = false
): {
  action: HybridAction;
  value: number;
  logProbs: {
    direction: number;
    tp: number;
    sl: number;
    size: number;
  };
} {
  const hiddenSize = model.hidden_size;
  let hidden = Array(hiddenSize).fill(0);
  let cell = Array(hiddenSize).fill(0);
  
  // Process sequence through LSTM
  for (const features of sequenceFeatures) {
    const result = lstmStep(features, hidden, cell, model.lstm_weights, model.lstm_biases);
    hidden = result.hidden;
    cell = result.cell;
  }
  
  // Generate action from final hidden state
  const directionLogits = matmul(hidden, model.actor_direction);
  const directionProbs = softmax(directionLogits);
  
  const tpMean = matmul(hidden, model.actor_tp_mean)[0];
  const tpStd = Math.exp(matmul(hidden, model.actor_tp_std)[0]);
  
  const slMean = matmul(hidden, model.actor_sl_mean)[0];
  const slStd = Math.exp(matmul(hidden, model.actor_sl_std)[0]);
  
  const sizeMean = matmul(hidden, model.actor_size_mean)[0];
  const sizeStd = Math.exp(matmul(hidden, model.actor_size_std)[0]);
  
  // Sample or take mean
  const direction = deterministicMode
    ? directionProbs.indexOf(Math.max(...directionProbs))
    : sampleCategorical(directionProbs);
    
  const tpOffset = deterministicMode ? tpMean : sampleGaussian(tpMean, tpStd);
  const slTight = deterministicMode ? slMean : sampleGaussian(slMean, slStd);
  const size = deterministicMode ? sizeMean : sampleGaussian(sizeMean, sizeStd);
  
  // Clamp to valid ranges
  const action: HybridAction = {
    direction,
    tp_offset: Math.max(-0.5, Math.min(0.5, tpOffset)),
    sl_tight: Math.max(0.5, Math.min(2.0, slTight)),
    size: Math.max(0.0, Math.min(1.0, sigmoid(size))) // Sigmoid to [0, 1]
  };
  
  // Get value estimate
  const value = matmul(hidden, model.critic_weights)[0] + model.critic_bias[0];
  
  // Calculate log probabilities
  const directionLogProb = Math.log(directionProbs[direction] + 1e-8);
  
  const tpLogProb = -0.5 * Math.log(2 * Math.PI * tpStd * tpStd) -
    0.5 * Math.pow(tpOffset - tpMean, 2) / (tpStd * tpStd);
    
  const slLogProb = -0.5 * Math.log(2 * Math.PI * slStd * slStd) -
    0.5 * Math.pow(slTight - slMean, 2) / (slStd * slStd);
    
  const sizeLogProb = -0.5 * Math.log(2 * Math.PI * sizeStd * sizeStd) -
    0.5 * Math.pow(size - sizeMean, 2) / (sizeStd * sizeStd);
  
  return {
    action,
    value,
    logProbs: {
      direction: directionLogProb,
      tp: tpLogProb,
      sl: slLogProb,
      size: sizeLogProb
    }
  };
}

// Serialize model to JSON
export function serializeModel(model: RecurrentPPOModel): string {
  return JSON.stringify(model);
}

// Deserialize model from JSON
export function deserializeModel(json: string): RecurrentPPOModel {
  return JSON.parse(json);
}
