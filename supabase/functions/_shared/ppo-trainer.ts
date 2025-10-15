// PPO Trainer - Complete PPO training algorithm with GAE, clipping loss, and gradient descent

import { RecurrentPPOModel, HybridAction, forwardPass } from './recurrent-ppo-model.ts';

export interface PPOConfig {
  gamma: number;           // Discount factor (default: 0.99)
  gae_lambda: number;      // GAE lambda (default: 0.95)
  clip_epsilon: number;    // PPO clipping epsilon (default: 0.2)
  learning_rate: number;   // Learning rate (default: 0.0003)
  entropy_coef: number;    // Entropy bonus coefficient (default: 0.01)
  value_loss_coef: number; // Value loss coefficient (default: 0.5)
  max_grad_norm: number;   // Gradient clipping max norm (default: 0.5)
  batch_size: number;      // Mini-batch size (default: 64)
  ppo_epochs: number;      // PPO update epochs per rollout (default: 4)
}

export interface Experience {
  state: number[][];       // Sequence of states [seq_len, features]
  action: HybridAction;
  reward: number;
  value: number;           // Critic's value estimate
  logProbs: {
    direction: number;
    tp_offset: number;
    sl_tight: number;
    size: number;
  };
  done: boolean;
  nextState: number[][];
  nextValue: number;
}

export interface TrainingMetrics {
  actor_loss: number;
  critic_loss: number;
  entropy: number;
  total_loss: number;
  kl_divergence: number;
  explained_variance: number;
}

export class ExperienceBuffer {
  private experiences: Experience[] = [];
  private advantages: number[] = [];
  private returns: number[] = [];

  store(exp: Experience) {
    this.experiences.push(exp);
  }

  setAdvantages(advantages: number[]) {
    this.advantages = advantages;
  }

  setReturns(returns: number[]) {
    this.returns = returns;
  }

  getExperiences(): Experience[] {
    return this.experiences;
  }

  getAdvantages(): number[] {
    return this.advantages;
  }

  getReturns(): number[] {
    return this.returns;
  }

  clear() {
    this.experiences = [];
    this.advantages = [];
    this.returns = [];
  }

  size(): number {
    return this.experiences.length;
  }

  getBatch(indices: number[]): { experiences: Experience[], advantages: number[], returns: number[] } {
    return {
      experiences: indices.map(i => this.experiences[i]),
      advantages: indices.map(i => this.advantages[i]),
      returns: indices.map(i => this.returns[i])
    };
  }
}

export class PPOTrainer {
  private config: PPOConfig;
  private model: RecurrentPPOModel;
  
  // Adam optimizer state
  private m_weights: Map<string, number[]> = new Map();
  private v_weights: Map<string, number[]> = new Map();
  private beta1 = 0.9;
  private beta2 = 0.999;
  private epsilon_adam = 1e-8;
  private timestep = 0;

  constructor(model: RecurrentPPOModel, config: Partial<PPOConfig> = {}) {
    this.model = model;
    this.config = {
      gamma: config.gamma ?? 0.99,
      gae_lambda: config.gae_lambda ?? 0.95,
      clip_epsilon: config.clip_epsilon ?? 0.2,
      learning_rate: config.learning_rate ?? 0.0003,
      entropy_coef: config.entropy_coef ?? 0.01,
      value_loss_coef: config.value_loss_coef ?? 0.5,
      max_grad_norm: config.max_grad_norm ?? 0.5,
      batch_size: config.batch_size ?? 64,
      ppo_epochs: config.ppo_epochs ?? 4
    };
  }

  createBuffer(): ExperienceBuffer {
    return new ExperienceBuffer();
  }

  /**
   * Compute Generalized Advantage Estimation (GAE)
   * 
   * GAE formula:
   * δ_t = r_t + γ * V(s_{t+1}) - V(s_t)
   * A_t = Σ_{l=0}^∞ (γλ)^l * δ_{t+l}
   */
  computeGAE(buffer: ExperienceBuffer): number[] {
    const experiences = buffer.getExperiences();
    const advantages: number[] = [];
    const returns: number[] = [];
    
    let gae = 0;
    
    // Compute advantages backwards from terminal state
    for (let t = experiences.length - 1; t >= 0; t--) {
      const exp = experiences[t];
      
      // TD error: δ_t = r_t + γ * V(s_{t+1}) - V(s_t)
      const nextValue = exp.done ? 0 : exp.nextValue;
      const delta = exp.reward + this.config.gamma * nextValue - exp.value;
      
      // GAE: A_t = δ_t + γλ * A_{t+1}
      gae = delta + this.config.gamma * this.config.gae_lambda * gae * (exp.done ? 0 : 1);
      advantages.unshift(gae);
      
      // Return: R_t = A_t + V(s_t)
      returns.unshift(gae + exp.value);
    }
    
    // Normalize advantages (improves stability)
    const mean = advantages.reduce((a, b) => a + b, 0) / advantages.length;
    const std = Math.sqrt(advantages.reduce((sum, a) => sum + (a - mean) ** 2, 0) / advantages.length);
    const normalizedAdvantages = advantages.map(a => (a - mean) / (std + 1e-8));
    
    buffer.setAdvantages(normalizedAdvantages);
    buffer.setReturns(returns);
    
    return normalizedAdvantages;
  }

  /**
   * Compute PPO loss components (updated for single experience)
   * 
   * Actor loss (clipped):
   * L^CLIP = E[ min(r_t * A_t, clip(r_t, 1-ε, 1+ε) * A_t) ]
   * where r_t = π_new / π_old (probability ratio)
   * 
   * Critic loss:
   * L^VF = E[ (V(s_t) - R_t)^2 ]
   * 
   * Entropy bonus:
   * L^ENT = E[ H(π(·|s_t)) ]
   */
  private computePPOLoss(
    exp: Experience,
    advantage: number,
    returnTarget: number,
    newAction: HybridAction,
    newValue: number,
    newLogProbs: Experience['logProbs']
  ): { actor_loss: number; critic_loss: number; entropy: number; ratio: number } {
    // Compute probability ratios (in log space for numerical stability)
    const logRatios = {
      direction: newLogProbs.direction - exp.logProbs.direction,
      tp_offset: newLogProbs.tp_offset - exp.logProbs.tp_offset,
      sl_tight: newLogProbs.sl_tight - exp.logProbs.sl_tight,
      size: newLogProbs.size - exp.logProbs.size
    };
    
    // Average ratio across action components
    const avgLogRatio = (logRatios.direction + logRatios.tp_offset + logRatios.sl_tight + logRatios.size) / 4;
    const ratio = Math.exp(avgLogRatio);
    
    // Clipped surrogate loss
    const surr1 = ratio * advantage;
    const surr2 = Math.min(
      Math.max(ratio, 1 - this.config.clip_epsilon),
      1 + this.config.clip_epsilon
    ) * advantage;
    const actor_loss = -Math.min(surr1, surr2);
    
    // Value function loss (MSE)
    const critic_loss = (newValue - returnTarget) ** 2;
    
    // Entropy (approximate from log probs)
    const entropy = -(
      newLogProbs.direction + 
      newLogProbs.tp_offset + 
      newLogProbs.sl_tight + 
      newLogProbs.size
    ) / 4;
    
    return { actor_loss, critic_loss, entropy, ratio };
  }

  /**
   * Compute numerical gradients using finite differences
   * 
   * ∂L/∂w ≈ (L(w + ε) - L(w - ε)) / (2ε)
   */
  private computeNumericalGradient(
    model: RecurrentPPOModel,
    paramName: string,
    paramIndex: number,
    lossFunction: (m: RecurrentPPOModel) => number,
    epsilon: number = 1e-5
  ): number {
    // Get parameter array
    const params = this.getModelParams(model, paramName);
    const originalValue = params[paramIndex];
    
    // Compute loss with +epsilon
    params[paramIndex] = originalValue + epsilon;
    const lossPlus = lossFunction(model);
    
    // Compute loss with -epsilon
    params[paramIndex] = originalValue - epsilon;
    const lossMinus = lossFunction(model);
    
    // Restore original value
    params[paramIndex] = originalValue;
    
    // Central difference
    return (lossPlus - lossMinus) / (2 * epsilon);
  }

  /**
   * Get reference to model parameter array by name
   */
  private getModelParams(model: RecurrentPPOModel, paramName: string): number[] {
    const parts = paramName.split('.');
    let obj: any = model;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]];
    }
    return obj[parts[parts.length - 1]];
  }

  /**
   * Update model weights using Adam optimizer
   */
  updateModel(buffer: ExperienceBuffer, advantages: number[]): TrainingMetrics {
    const experiences = buffer.getExperiences();
    const returns = buffer.getReturns();
    
    if (experiences.length === 0) {
      throw new Error('Cannot update model with empty buffer');
    }
    
    let totalActorLoss = 0;
    let totalCriticLoss = 0;
    let totalEntropy = 0;
    let totalKL = 0;
    let batchCount = 0;
    
    // Run multiple PPO epochs over the data
    for (let epoch = 0; epoch < this.config.ppo_epochs; epoch++) {
      // Shuffle indices for mini-batches
      const indices = Array.from({ length: experiences.length }, (_, i) => i);
      this.shuffleArray(indices);
      
      // Process mini-batches
      for (let start = 0; start < indices.length; start += this.config.batch_size) {
        const end = Math.min(start + this.config.batch_size, indices.length);
        const batchIndices = indices.slice(start, end);
        const batch = buffer.getBatch(batchIndices);
        
        // Compute gradients for this batch
        const gradients = this.computeBatchGradients(batch.experiences, batch.advantages, batch.returns);
        
        // Apply gradients with Adam optimizer
        this.applyGradients(gradients);
        
        // Accumulate metrics
        totalActorLoss += gradients.metrics.actor_loss;
        totalCriticLoss += gradients.metrics.critic_loss;
        totalEntropy += gradients.metrics.entropy;
        totalKL += gradients.metrics.kl_divergence;
        batchCount++;
      }
    }
    
    // Compute explained variance
    const valuePredictions = experiences.map(e => e.value);
    const explainedVar = this.computeExplainedVariance(valuePredictions, returns);
    
    return {
      actor_loss: totalActorLoss / batchCount,
      critic_loss: totalCriticLoss / batchCount,
      entropy: totalEntropy / batchCount,
      total_loss: (totalActorLoss + totalCriticLoss - totalEntropy * this.config.entropy_coef) / batchCount,
      kl_divergence: totalKL / batchCount,
      explained_variance: explainedVar
    };
  }

  /**
   * Compute gradients for a batch using numerical differentiation
   * Uses finite differences with smart parameter sampling for efficiency
   */
  private computeBatchGradients(
    experiences: Experience[],
    advantages: number[],
    returns: number[]
  ): { gradients: Map<string, number[]>; metrics: any } {
    
    // Create closure that computes total loss for given model state
    const computeTotalLoss = (testModel: RecurrentPPOModel): number => {
      let totalLoss = 0;
      
      for (let i = 0; i < experiences.length; i++) {
        const exp = experiences[i];
        const advantage = advantages[i];
        const returnTarget = returns[i];
        
        // Forward pass with test model
        const result = forwardPass(testModel, exp.state, false);
        
        // Compute PPO losses
        const { actor_loss, critic_loss, entropy } = this.computePPOLoss(
          exp,
          advantage,
          returnTarget,
          result.action,
          result.value,
          result.logProbs
        );
        
        // Combined loss
        totalLoss += actor_loss + 
                     this.config.value_loss_coef * critic_loss - 
                     this.config.entropy_coef * entropy;
      }
      
      return totalLoss / experiences.length;
    };
    
    const gradients = new Map<string, number[]>();
    const epsilon = 1e-5;
    
    // Define parameter groups to update (prioritize actor/critic over LSTM)
    const paramGroups: Array<{ name: string; sampleRate: number }> = [
      // Actor heads - most critical for immediate learning
      { name: 'actor_direction', sampleRate: 0.5 },
      { name: 'actor_tp_mean', sampleRate: 0.5 },
      { name: 'actor_tp_std', sampleRate: 0.5 },
      { name: 'actor_sl_mean', sampleRate: 0.5 },
      { name: 'actor_sl_std', sampleRate: 0.5 },
      { name: 'actor_size_mean', sampleRate: 0.5 },
      { name: 'actor_size_std', sampleRate: 0.5 },
      
      // Critic head
      { name: 'critic_weights', sampleRate: 0.5 },
      { name: 'critic_bias', sampleRate: 1.0 }, // Always update biases (cheap, high impact)
      
      // LSTM - expensive, skip during initial training (edge function timeout risk)
      { name: 'lstm_weights', sampleRate: 0 },  // ✅ Disabled to avoid timeout
      { name: 'lstm_biases', sampleRate: 0 }     // ✅ Disabled to avoid timeout
    ];
    
    // Clone model for gradient computation to avoid side effects
    const testModel = JSON.parse(JSON.stringify(this.model)) as RecurrentPPOModel;
    
    for (const { name: paramName, sampleRate } of paramGroups) {
      if (sampleRate === 0) continue;
      
      const paramArray = this.flattenParam(testModel, paramName);
      const paramGrads = new Array(paramArray.length).fill(0);
      
      // Sample indices for large parameter arrays
      const indices = this.sampleIndices(paramArray.length, sampleRate);
      
      for (const idx of indices) {
        // Compute gradient for this specific weight using central difference
        const originalValue = paramArray[idx];
        
        // Forward perturbation
        paramArray[idx] = originalValue + epsilon;
        this.updateModelParam(testModel, paramName, paramArray);
        const lossPlus = computeTotalLoss(testModel);
        
        // Backward perturbation
        paramArray[idx] = originalValue - epsilon;
        this.updateModelParam(testModel, paramName, paramArray);
        const lossMinus = computeTotalLoss(testModel);
        
        // Restore original value
        paramArray[idx] = originalValue;
        this.updateModelParam(testModel, paramName, paramArray);
        
        // Central difference gradient
        paramGrads[idx] = (lossPlus - lossMinus) / (2 * epsilon);
      }
      
      gradients.set(paramName, paramGrads);
    }
    
    // Compute metrics on current batch for monitoring
    let batchActorLoss = 0;
    let batchCriticLoss = 0;
    let batchEntropy = 0;
    
    for (let i = 0; i < Math.min(experiences.length, 32); i++) {
      const exp = experiences[i];
      const result = forwardPass(this.model, exp.state, false);
      const { actor_loss, critic_loss, entropy } = this.computePPOLoss(
        exp,
        advantages[i],
        returns[i],
        result.action,
        result.value,
        result.logProbs
      );
      
      batchActorLoss += actor_loss;
      batchCriticLoss += critic_loss;
      batchEntropy += entropy;
    }
    
    const sampleSize = Math.min(experiences.length, 32);
    
    return {
      gradients,
      metrics: {
        actor_loss: batchActorLoss / sampleSize,
        critic_loss: batchCriticLoss / sampleSize,
        entropy: batchEntropy / sampleSize,
        kl_divergence: 0, // Placeholder
        gradient_norm: this.computeGradientNorm(gradients)
      }
    };
  }

  /**
   * Flatten parameter (matrix or vector) to 1D array
   */
  private flattenParam(model: RecurrentPPOModel, paramName: string): number[] {
    const param = (model as any)[paramName];
    
    if (!param) {
      throw new Error(`Parameter ${paramName} not found in model`);
    }
    
    if (Array.isArray(param[0])) {
      // Matrix: flatten to 1D
      return param.flat();
    } else {
      // Vector: already 1D
      return [...param]; // Clone to avoid mutations
    }
  }

  /**
   * Reconstruct parameter from flat array
   */
  private unflattenParam(
    flat: number[],
    originalShape: number[][] | number[]
  ): number[][] | number[] {
    if (Array.isArray(originalShape[0])) {
      // Reconstruct matrix
      const rows = originalShape.length;
      const cols = (originalShape as number[][])[0].length;
      const result: number[][] = [];
      
      for (let i = 0; i < rows; i++) {
        result.push(flat.slice(i * cols, (i + 1) * cols));
      }
      return result;
    } else {
      // Keep as vector
      return [...flat];
    }
  }

  /**
   * Sample indices for gradient computation (uniform random sampling)
   */
  private sampleIndices(totalCount: number, sampleRate: number): number[] {
    // For small arrays, use all indices
    if (totalCount < 100 || sampleRate >= 1.0) {
      return Array.from({ length: totalCount }, (_, i) => i);
    }
    
    // For large arrays, sample uniformly
    const sampleSize = Math.max(1, Math.ceil(totalCount * sampleRate));
    const indices: number[] = [];
    const step = Math.floor(totalCount / sampleSize);
    
    for (let i = 0; i < sampleSize; i++) {
      const idx = (i * step + Math.floor(Math.random() * step)) % totalCount;
      indices.push(idx);
    }
    
    return indices;
  }

  /**
   * Update model parameter from flat array
   */
  private updateModelParam(
    model: RecurrentPPOModel,
    paramName: string,
    flatValues: number[]
  ): void {
    const originalParam = (model as any)[paramName];
    (model as any)[paramName] = this.unflattenParam(flatValues, originalParam);
  }

  /**
   * Compute gradient norm for monitoring
   */
  private computeGradientNorm(gradients: Map<string, number[]>): number {
    let sumSquares = 0;
    let count = 0;
    
    for (const grads of gradients.values()) {
      for (const g of grads) {
        sumSquares += g * g;
        count++;
      }
    }
    
    return count > 0 ? Math.sqrt(sumSquares / count) : 0;
  }

  /**
   * Apply gradients using Adam optimizer
   */
  private applyGradients(gradientsMap: Map<string, number[]>) {
    this.timestep++;
    
    for (const [paramName, gradients] of gradientsMap.entries()) {
      // Initialize Adam state if needed
      if (!this.m_weights.has(paramName)) {
        this.m_weights.set(paramName, new Array(gradients.length).fill(0));
        this.v_weights.set(paramName, new Array(gradients.length).fill(0));
      }
      
      const m = this.m_weights.get(paramName)!;
      const v = this.v_weights.get(paramName)!;
      const params = this.getModelParams(this.model, paramName);
      
      // Clip gradients by norm
      const gradNorm = Math.sqrt(gradients.reduce((sum, g) => sum + g * g, 0));
      const clipCoef = Math.min(1.0, this.config.max_grad_norm / (gradNorm + 1e-8));
      
      for (let i = 0; i < gradients.length; i++) {
        const grad = gradients[i] * clipCoef;
        
        // Adam update
        m[i] = this.beta1 * m[i] + (1 - this.beta1) * grad;
        v[i] = this.beta2 * v[i] + (1 - this.beta2) * grad * grad;
        
        // Bias correction
        const m_hat = m[i] / (1 - Math.pow(this.beta1, this.timestep));
        const v_hat = v[i] / (1 - Math.pow(this.beta2, this.timestep));
        
        // Update parameter
        params[i] -= this.config.learning_rate * m_hat / (Math.sqrt(v_hat) + this.epsilon_adam);
      }
    }
  }

  /**
   * Compute explained variance: 1 - Var(y - ŷ) / Var(y)
   */
  private computeExplainedVariance(predictions: number[], targets: number[]): number {
    if (predictions.length !== targets.length || predictions.length === 0) {
      return 0;
    }
    
    const residuals = predictions.map((p, i) => targets[i] - p);
    const residualVariance = this.variance(residuals);
    const targetVariance = this.variance(targets);
    
    return 1 - (residualVariance / (targetVariance + 1e-8));
  }

  private variance(arr: number[]): number {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / arr.length;
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  getConfig(): PPOConfig {
    return { ...this.config };
  }

  getModel(): RecurrentPPOModel {
    return this.model;
  }
}
