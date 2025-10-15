// Reward Calculator - Symmetric structure-aware reward function

import { StructuralFeatures } from './structural-features.ts';
import { HybridAction } from './recurrent-ppo-model.ts';

export interface RewardConfig {
  lambda_dd: number;      // Drawdown penalty coefficient (default: 0.10)
  lambda_turn: number;    // Turnover penalty coefficient (default: 0.01)
  tp_bonus: number;       // TP hit bonus multiplier (default: 0.10)
  sl_penalty: number;     // SL hit penalty multiplier (default: 0.80)
  confluence_bonus: number; // Confluence score bonus multiplier (default: 0.20)
}

export interface TradeInfo {
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  hitTP: boolean;
  hitSL: boolean;
  fees: number;
  slippage: number;
  confluenceScore: number;
  fibAlignment?: number;
  chosenFibLevel: number;
  atr: number;
}

export interface EpisodeState {
  currentDrawdown: number;
  previousMaxDrawdown: number;
  tradeCount: number;
  initialEquity: number;
}

/**
 * Calculate confluence score for an entry decision
 * 
 * Combines multiple structural factors to assess trade quality:
 * - Regime alignment (30%): Does market regime support the direction?
 * - S/R proximity (30%): Is entry near supportive level?
 * - Fib plausibility (20%): Is target reachable without major barriers?
 * - Volatility context (20%): Is volatility regime favorable?
 * 
 * Returns score in [0, 1]
 */
export function calculateConfluenceScore(
  structural: StructuralFeatures,
  direction: 'long' | 'short',
  action: HybridAction
): number {
  let score = 0;

  // 1. Regime alignment (0.3 weight)
  // Check if market regime supports the trading direction
  if (direction === 'long') {
    // For longs: prefer advancing or accumulation
    score += 0.3 * (structural.reg_adv * 0.7 + structural.reg_acc * 0.3);
  } else {
    // For shorts: prefer declining or distribution
    score += 0.3 * (structural.reg_decl * 0.7 + structural.reg_dist * 0.3);
  }

  // 2. S/R proximity (0.3 weight)
  // Long: want to be near support (low dist_to_support)
  // Short: want to be near resistance (low dist_to_resistance)
  if (direction === 'long') {
    const supportProximity = structural.dist_to_support;
    if (supportProximity > 0 && supportProximity < 2.0) {
      // Closer to support = higher score
      const proximityScore = 1 - (supportProximity / 2.0);
      // Weight by S/R strength
      score += 0.3 * proximityScore * Math.min(1.0, structural.sr_strength / 3.0);
    }
  } else {
    const resistanceProximity = structural.dist_to_resistance;
    if (resistanceProximity > 0 && resistanceProximity < 2.0) {
      // Closer to resistance = higher score
      const proximityScore = 1 - (resistanceProximity / 2.0);
      // Weight by S/R strength
      score += 0.3 * proximityScore * Math.min(1.0, structural.sr_strength / 3.0);
    }
  }

  // 3. Fibonacci plausibility (0.2 weight)
  // Check if Fibonacci target is within reasonable distance
  let fibDist: number;
  if (direction === 'long') {
    // For longs: check distance to upward Fib extensions
    fibDist = Math.min(Math.abs(structural.dist_127_up), Math.abs(structural.dist_161_up));
  } else {
    // For shorts: check distance to downward Fib extensions
    fibDist = Math.min(Math.abs(structural.dist_127_dn), Math.abs(structural.dist_161_dn));
  }
  
  // Fib target should be within 3 ATR (not too far)
  if (fibDist < 3.0) {
    const fibScore = 1 - (fibDist / 3.0);
    score += 0.2 * fibScore;
  }

  // Also check retracement levels for pullback opportunities
  const retracementBonus = Math.min(
    1.0,
    Math.max(0, 2.0 - Math.abs(structural.dist_38_retrace)) / 2.0 +
    Math.max(0, 2.0 - Math.abs(structural.dist_61_retrace)) / 2.0
  ) * 0.5;
  score += 0.1 * retracementBonus;

  // 4. Volatility context (0.2 weight)
  // Mid volatility (vol_regime = 1) is optimal
  // Low volatility (vol_regime = 0) is acceptable
  // High volatility (vol_regime = 2) is risky
  if (structural.vol_regime === 1) {
    score += 0.2; // Mid volatility: full points
  } else if (structural.vol_regime === 0) {
    score += 0.1; // Low volatility: half points
  } else {
    score += 0.05; // High volatility: minimal points
  }

  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * Calculate Fibonacci alignment score
 * 
 * Measures how close the exit price was to the chosen Fibonacci level.
 * Higher alignment indicates the model correctly identified structural targets.
 * 
 * Returns score in [0, 1]
 */
export function calculateFibAlignment(
  exitPrice: number,
  chosenFibLevel: number,
  atr: number
): number {
  // Distance in ATR units
  const distanceATR = Math.abs(exitPrice - chosenFibLevel) / atr;
  
  // Inverse distance: closer = higher score
  // Using 1/(1+d) to get score in [0, 1]
  const alignment = 1.0 / (1.0 + distanceATR);
  
  return alignment;
}

/**
 * Calculate final reward for a completed trade
 * 
 * Implements symmetric, structure-aware reward:
 * 1. Base PnL reward (direction-agnostic)
 * 2. TP/SL modifiers (bonus for TP, penalty for SL)
 * 3. Structural bonuses (confluence, Fib alignment)
 * 4. Risk penalties (drawdown, turnover)
 * 
 * Formula:
 * reward = pnl_net * 200
 * if hit_tp: reward *= (1 + 0.10 * fib_alignment)
 * if hit_sl: reward *= 0.80
 * reward *= (1 + 0.20 * confluence)
 * reward -= λ_dd * max(0, ΔMDD)
 * reward -= λ_turn * trade_increment
 */
export function calculateReward(
  trade: TradeInfo,
  episodeState: EpisodeState,
  config: Partial<RewardConfig> = {}
): number {
  const cfg: RewardConfig = {
    lambda_dd: config.lambda_dd ?? 0.10,
    lambda_turn: config.lambda_turn ?? 0.01,
    tp_bonus: config.tp_bonus ?? 0.10,
    sl_penalty: config.sl_penalty ?? 0.80,
    confluence_bonus: config.confluence_bonus ?? 0.20
  };

  // 1. Base reward: Net PnL scaled by equity (direction-agnostic)
  // Use pnlPercent to normalize across different entry prices
  let reward = trade.pnlPercent * 200;

  // 2. TP/SL modifiers
  if (trade.hitTP) {
    // Bonus for hitting TP, weighted by Fibonacci alignment
    if (trade.fibAlignment !== undefined) {
      reward *= (1.0 + cfg.tp_bonus * trade.fibAlignment);
    } else {
      reward *= (1.0 + cfg.tp_bonus * 0.5); // Default moderate bonus if no alignment data
    }
  }

  if (trade.hitSL) {
    // Penalty for hitting SL (but not too harsh to avoid risk-aversion)
    reward *= cfg.sl_penalty;
  }

  // 3. Structural bonus: Reward high-confidence trades
  reward *= (1.0 + cfg.confluence_bonus * trade.confluenceScore);

  // 4. Drawdown penalty
  // Penalize increase in max drawdown during this trade
  const deltaMDD = Math.max(0, episodeState.currentDrawdown - episodeState.previousMaxDrawdown);
  reward -= cfg.lambda_dd * deltaMDD;

  // 5. Turnover penalty
  // Small constant penalty to discourage excessive trading
  reward -= cfg.lambda_turn;

  return reward;
}

/**
 * Calculate per-step holding reward (optional, for ongoing positions)
 * 
 * Can be used to provide gradual feedback while position is open,
 * rather than waiting for trade completion.
 */
export function calculateHoldingReward(
  currentPnL: number,
  barsHeld: number,
  maxBarsToHold: number = 100
): number {
  // Small positive reward for profitable open positions
  let reward = 0;
  
  if (currentPnL > 0) {
    reward += 0.001 * currentPnL; // Tiny reward for unrealized profit
  }
  
  // Small penalty for holding too long (encourages timely exits)
  if (barsHeld > maxBarsToHold * 0.5) {
    reward -= 0.001;
  }
  
  return reward;
}

/**
 * Calculate batch reward statistics for monitoring
 */
export function calculateBatchRewardStats(rewards: number[]): {
  mean: number;
  std: number;
  min: number;
  max: number;
  positive_ratio: number;
} {
  if (rewards.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, positive_ratio: 0 };
  }

  const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
  const variance = rewards.reduce((sum, r) => sum + (r - mean) ** 2, 0) / rewards.length;
  const std = Math.sqrt(variance);
  const min = Math.min(...rewards);
  const max = Math.max(...rewards);
  const positive_ratio = rewards.filter(r => r > 0).length / rewards.length;

  return { mean, std, min, max, positive_ratio };
}

/**
 * Validate reward is not NaN or infinite (safety check)
 */
export function validateReward(reward: number, context: string = ''): number {
  if (!isFinite(reward)) {
    console.warn(`Invalid reward detected: ${reward} in ${context}`);
    return 0; // Default to zero for invalid rewards
  }
  
  // Clamp extreme rewards to prevent gradient explosion
  const MAX_REWARD = 100;
  const MIN_REWARD = -100;
  
  if (reward > MAX_REWARD) {
    console.warn(`Reward clamped: ${reward} -> ${MAX_REWARD} in ${context}`);
    return MAX_REWARD;
  }
  
  if (reward < MIN_REWARD) {
    console.warn(`Reward clamped: ${reward} -> ${MIN_REWARD} in ${context}`);
    return MIN_REWARD;
  }
  
  return reward;
}

/**
 * Export default config for easy access
 */
export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  lambda_dd: 0.10,
  lambda_turn: 0.01,
  tp_bonus: 0.10,
  sl_penalty: 0.80,
  confluence_bonus: 0.20
};
