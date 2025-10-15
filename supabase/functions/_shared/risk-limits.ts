// Risk Limits - Enforce hard caps on position sizing, losses, and leverage

import { EnvironmentState, EnvironmentConfig, Position } from './trading-environment.ts';

export interface RiskViolation {
  type: 'daily_loss_cap' | 'max_drawdown' | 'max_leverage' | 'position_size';
  severity: 'critical' | 'warning';
  details: string;
  value: number;
  limit: number;
}

export interface PositionSizeValidation {
  valid: boolean;
  adjustedQty: number;
  reason?: string;
  originalRisk: number;
  maxRisk: number;
}

export interface RiskBreachResponse {
  shouldFlatten: boolean;
  cooldownBars: number;
  penalty: number;
}

/**
 * Risk Limit Manager - Check all risk limits before and during trading
 */
export class RiskLimitManager {
  private cooldownRemaining: number = 0;
  
  /**
   * Check all risk limits for violations
   * Call this before executing any trade action
   */
  checkLimits(
    state: EnvironmentState,
    config: EnvironmentConfig
  ): RiskViolation | null {
    // 1. Check daily loss cap (critical)
    const dailyLossPercent = state.dailyPnL / state.equity;
    if (dailyLossPercent < -config.dailyLossCap) {
      return {
        type: 'daily_loss_cap',
        severity: 'critical',
        details: `Daily loss ${(dailyLossPercent * 100).toFixed(2)}% exceeds cap ${(config.dailyLossCap * 100).toFixed(2)}%`,
        value: Math.abs(dailyLossPercent),
        limit: config.dailyLossCap
      };
    }
    
    // 2. Check max drawdown (critical)
    if (state.maxDrawdown > 0.25) { // 25% hard limit
      return {
        type: 'max_drawdown',
        severity: 'critical',
        details: `Max drawdown ${(state.maxDrawdown * 100).toFixed(2)}% exceeds 25% limit`,
        value: state.maxDrawdown,
        limit: 0.25
      };
    }
    
    // 3. Check leverage (warning)
    const currentLeverage = this.calculateLeverage(state);
    if (currentLeverage > config.maxLeverage) {
      return {
        type: 'max_leverage',
        severity: 'warning',
        details: `Leverage ${currentLeverage.toFixed(2)}x exceeds limit ${config.maxLeverage}x`,
        value: currentLeverage,
        limit: config.maxLeverage
      };
    }
    
    return null;
  }
  
  /**
   * Calculate current leverage based on open positions
   */
  private calculateLeverage(state: EnvironmentState): number {
    if (!state.position) return 0;
    
    const positionValue = state.position.quantity * state.position.entryPrice;
    return positionValue / state.equity;
  }
  
  /**
   * Check if in cooldown period (after risk breach)
   */
  isInCooldown(): boolean {
    return this.cooldownRemaining > 0;
  }
  
  /**
   * Decrement cooldown counter
   */
  decrementCooldown(): void {
    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining--;
    }
  }
  
  /**
   * Set cooldown period
   */
  setCooldown(bars: number): void {
    this.cooldownRemaining = bars;
  }
  
  /**
   * Get remaining cooldown bars
   */
  getCooldownRemaining(): number {
    return this.cooldownRemaining;
  }
}

/**
 * Validate position size against risk limits
 * Auto-adjusts quantity if risk is too high
 */
export function validatePositionSize(
  qty: number,
  entryPrice: number,
  sl: number,
  equity: number,
  config: EnvironmentConfig
): PositionSizeValidation {
  // Calculate risk in dollars
  const riskPerTrade = Math.abs(entryPrice - sl) * qty;
  const maxRiskDollars = equity * config.maxRiskPerTrade;
  
  if (riskPerTrade > maxRiskDollars) {
    // Adjust quantity to meet risk limit
    const adjustedQty = Math.floor(maxRiskDollars / Math.abs(entryPrice - sl));
    
    return {
      valid: false,
      adjustedQty: Math.max(1, adjustedQty), // Minimum 1 unit
      reason: `Risk too high: $${riskPerTrade.toFixed(2)} > $${maxRiskDollars.toFixed(2)}. Adjusted qty from ${qty} to ${adjustedQty}`,
      originalRisk: riskPerTrade,
      maxRisk: maxRiskDollars
    };
  }
  
  // Check against max quantity limit
  if (qty > config.maxQtyPerAsset) {
    return {
      valid: false,
      adjustedQty: config.maxQtyPerAsset,
      reason: `Quantity ${qty} exceeds max ${config.maxQtyPerAsset}`,
      originalRisk: riskPerTrade,
      maxRisk: maxRiskDollars
    };
  }
  
  return {
    valid: true,
    adjustedQty: qty,
    originalRisk: riskPerTrade,
    maxRisk: maxRiskDollars
  };
}

/**
 * Handle risk breach - determine response action
 * Critical breaches trigger immediate flatten and cooldown
 */
export function handleRiskBreach(
  violation: RiskViolation,
  state: EnvironmentState
): RiskBreachResponse {
  if (violation.severity === 'critical') {
    // Critical breach: flatten position and enter cooldown
    let cooldownBars = 10; // Default cooldown
    let penalty = -0.5; // Moderate penalty
    
    if (violation.type === 'daily_loss_cap') {
      // Longer cooldown for daily loss cap breach
      cooldownBars = 20;
      penalty = -1.0; // Stronger penalty
    } else if (violation.type === 'max_drawdown') {
      // Very long cooldown for max drawdown breach
      cooldownBars = 50;
      penalty = -2.0; // Strong penalty
    }
    
    return {
      shouldFlatten: true,
      cooldownBars,
      penalty
    };
  }
  
  // Warning-level breaches: log but allow trade (with small penalty)
  return {
    shouldFlatten: false,
    cooldownBars: 0,
    penalty: -0.1
  };
}

/**
 * Validate leverage for new position
 * Prevents opening positions that would exceed leverage limit
 */
export function validateLeverage(
  newPositionValue: number,
  equity: number,
  maxLeverage: number
): { valid: boolean; currentLeverage: number; maxAllowed: number } {
  const leverage = newPositionValue / equity;
  
  return {
    valid: leverage <= maxLeverage,
    currentLeverage: leverage,
    maxAllowed: maxLeverage
  };
}

/**
 * Check if daily loss cap would be breached by potential loss
 * Used for pre-trade validation
 */
export function wouldBreachDailyLossCap(
  currentDailyPnL: number,
  potentialLoss: number,
  equity: number,
  dailyLossCap: number
): boolean {
  const projectedDailyPnL = currentDailyPnL + potentialLoss;
  const projectedLossPercent = projectedDailyPnL / equity;
  return projectedLossPercent < -dailyLossCap;
}

/**
 * Reset daily PnL tracking
 * Should be called at the start of each trading day
 */
export function shouldResetDailyPnL(
  currentBar: number,
  lastResetBar: number,
  barsPerDay: number = 24
): boolean {
  return currentBar - lastResetBar >= barsPerDay;
}

/**
 * Calculate maximum safe position size given constraints
 */
export function calculateMaxSafePositionSize(
  entryPrice: number,
  stopLoss: number,
  equity: number,
  config: EnvironmentConfig
): number {
  // Max size based on risk per trade
  const maxRiskDollars = equity * config.maxRiskPerTrade;
  const stopDistance = Math.abs(entryPrice - stopLoss);
  const maxQtyByRisk = Math.floor(maxRiskDollars / stopDistance);
  
  // Max size based on leverage
  const maxPositionValue = equity * config.maxLeverage;
  const maxQtyByLeverage = Math.floor(maxPositionValue / entryPrice);
  
  // Max size based on absolute limit
  const maxQtyByLimit = config.maxQtyPerAsset;
  
  // Return the most restrictive limit
  return Math.max(1, Math.min(maxQtyByRisk, maxQtyByLeverage, maxQtyByLimit));
}

/**
 * Format risk violation for logging
 */
export function formatRiskViolation(violation: RiskViolation): string {
  return `[${violation.severity.toUpperCase()}] ${violation.type}: ${violation.details} (${(violation.value * 100).toFixed(2)}% vs limit ${(violation.limit * 100).toFixed(2)}%)`;
}
