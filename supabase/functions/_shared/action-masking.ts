// Action Masking - Prevent trades in unfavorable market conditions

import { StructuralFeatures } from './structural-features.ts';
import { calculateConfluenceScore } from './reward-calculator.ts';

export interface ActionMask {
  canTradeLong: boolean;
  canTradeShort: boolean;
  canHold: boolean;
  reason: string;
  confluenceScore: number;
}

/**
 * Apply action masking to prevent trades when market conditions are unfavorable
 * 
 * @param state - Current market state (sequence of features)
 * @param structural - Structural features for current bar
 * @param confluenceThreshold - Minimum confluence score required (default: 0.5)
 * @returns ActionMask indicating which actions are allowed and why
 */
export function applyActionMask(
  state: number[][],
  structural: StructuralFeatures,
  confluenceThreshold: number = 0.5
): ActionMask {
  // Calculate confluence for both directions
  const confluenceLong = calculateConfluenceScore(structural, 'long', null as any);
  const confluenceShort = calculateConfluenceScore(structural, 'short', null as any);
  
  // Check market conditions
  const conditions = checkMarketConditions(structural);
  
  // Determine if each direction is allowed
  const canTradeLong = 
    confluenceLong >= confluenceThreshold && 
    conditions.volatilityOk && 
    conditions.dataComplete &&
    !conditions.extremeVolatility;
    
  const canTradeShort = 
    confluenceShort >= confluenceThreshold && 
    conditions.volatilityOk && 
    conditions.dataComplete &&
    !conditions.extremeVolatility;
  
  // Determine reason for masking
  let reason = 'ok';
  if (!canTradeLong && !canTradeShort) {
    if (confluenceLong < confluenceThreshold && confluenceShort < confluenceThreshold) {
      reason = 'low_confluence';
    } else if (conditions.extremeVolatility) {
      reason = 'extreme_volatility';
    } else if (!conditions.dataComplete) {
      reason = 'insufficient_data';
    } else {
      reason = 'unfavorable_conditions';
    }
  }
  
  return {
    canTradeLong,
    canTradeShort,
    canHold: true, // Always allow holding/flat
    reason,
    confluenceScore: Math.max(confluenceLong, confluenceShort)
  };
}

/**
 * Check additional market conditions beyond confluence
 */
function checkMarketConditions(structural: StructuralFeatures): {
  volatilityOk: boolean;
  dataComplete: boolean;
  extremeVolatility: boolean;
} {
  // Check volatility regime (avoid extreme volatility)
  const extremeVolatility = structural.vol_regime >= 2;
  const volatilityOk = structural.vol_regime <= 2;
  
  // Check if we have complete structural data
  const dataComplete = 
    structural.atr > 0 &&
    !isNaN(structural.dist_to_support) &&
    !isNaN(structural.dist_to_resistance);
  
  return {
    volatilityOk,
    dataComplete,
    extremeVolatility
  };
}

/**
 * Mask actor logits directly (for use in model inference)
 * Sets invalid direction logits to -Infinity to prevent selection
 * 
 * @param logits - Raw actor output [HOLD, LONG, SHORT]
 * @param mask - ActionMask from applyActionMask()
 * @returns Masked logits
 */
export function maskActorLogits(
  logits: number[],
  mask: ActionMask
): number[] {
  const masked = [...logits];
  
  // Index 0 = HOLD, Index 1 = LONG, Index 2 = SHORT
  if (!mask.canTradeLong) {
    masked[1] = -Infinity; // Mask LONG
  }
  
  if (!mask.canTradeShort) {
    masked[2] = -Infinity; // Mask SHORT
  }
  
  // Ensure at least HOLD is available
  if (!isFinite(masked[0])) {
    masked[0] = 0;
  }
  
  return masked;
}

/**
 * Check if action is allowed given mask
 * Used for post-hoc validation after action selection
 */
export function isActionAllowed(
  action: number, // 0=HOLD, 1=LONG, 2=SHORT
  mask: ActionMask
): boolean {
  if (action === 0) return mask.canHold;
  if (action === 1) return mask.canTradeLong;
  if (action === 2) return mask.canTradeShort;
  return false;
}

/**
 * Override action to HOLD if it's masked
 * Used when action is selected before masking is applied
 */
export function overrideMaskedAction(
  action: number,
  mask: ActionMask
): { action: number; wasOverridden: boolean } {
  if (!isActionAllowed(action, mask)) {
    return { action: 0, wasOverridden: true }; // Force HOLD
  }
  return { action, wasOverridden: false };
}

/**
 * Get human-readable explanation for why action was masked
 */
export function getMaskingExplanation(mask: ActionMask): string {
  if (mask.reason === 'ok') {
    return 'No masking applied';
  }
  
  const explanations: Record<string, string> = {
    'low_confluence': `Confluence score ${mask.confluenceScore.toFixed(2)} below threshold`,
    'extreme_volatility': 'Market volatility too high for safe entry',
    'insufficient_data': 'Incomplete structural data for current bar',
    'unfavorable_conditions': 'Market conditions not favorable for entry'
  };
  
  return explanations[mask.reason] || mask.reason;
}
