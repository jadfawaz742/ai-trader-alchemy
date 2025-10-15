// Trading Environment - Gym-style trading simulator with exact TP/SL formulas

import { HybridAction } from './recurrent-ppo-model.ts';
import { OHLCV, extractStructuralFeatures, StructuralFeatures } from './structural-features.ts';
import { calculateTechnicalIndicators } from './technical-indicators.ts';
import { applyActionMask, overrideMaskedAction, ActionMask } from './action-masking.ts';
import { 
  RiskLimitManager, 
  validatePositionSize, 
  handleRiskBreach, 
  shouldResetDailyPnL 
} from './risk-limits.ts';

export interface EnvironmentConfig {
  maxRiskPerTrade: number;    // Default: 0.02 (2%)
  maxQtyPerAsset: number;     // Maximum quantity per trade
  dailyLossCap: number;       // Default: 0.06 (6%)
  maxLeverage: number;        // Default: 3.0
  pointValue: number;         // Default: 1.0
  initialEquity: number;      // Default: 10000
  
  // Domain randomization ranges
  feesMin: number;           // Default: 0.0002 (0.02%)
  feesMax: number;           // Default: 0.001 (0.10%)
  slippageMin: number;       // Default: 0.0001 (0.01%)
  slippageMax: number;       // Default: 0.0005 (0.05%)
  spreadTicksMin: number;    // Default: 0.5
  spreadTicksMax: number;    // Default: 2.0
}

export interface Position {
  direction: 'long' | 'short';
  entryPrice: number;
  entryBar: number;
  quantity: number;
  tp: number;
  sl: number;
  chosenFibLevel: number;
  confluenceScore: number;
}

export interface TradeResult {
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  entryBar: number;
  exitBar: number;
  pnl: number;
  pnlPercent: number;
  hitTP: boolean;
  hitSL: boolean;
  fees: number;
  slippage: number;
  quantity: number;
  tpDistance: number;
  slDistance: number;
  confluenceScore: number;
  fibAlignment?: number;
}

export interface EnvironmentState {
  equity: number;
  drawdown: number;
  maxDrawdown: number;
  currentBar: number;
  position: Position | null;
  trades: TradeResult[];
  dailyPnL: number;
  lastResetBar: number;
}

export interface StepResult {
  nextState: number[][];      // Sequence of features [seq_len, features]
  reward: number;
  done: boolean;
  info: {
    trade?: TradeResult;
    equity: number;
    drawdown: number;
    position: Position | null;
  };
}

export class TradingEnvironment {
  private data: OHLCV[];
  private config: EnvironmentConfig;
  private state: EnvironmentState;
  
  // Randomized parameters per episode
  private episodeFees: number = 0;
  private episodeSlippage: number = 0;
  private episodeSpread: number = 0;
  
  private sequenceLength = 50;
  
  // Feature configuration for curriculum learning
  private featureConfig: { features: number; enableStructural: boolean };
  
  // Risk management
  private riskLimitManager: RiskLimitManager;
  
  // Anomaly tracking
  public anomalies: Array<{
    bar: number;
    type: string;
    details: string;
    autoCorrected: boolean;
  }> = [];

  constructor(
    data: OHLCV[], 
    config: Partial<EnvironmentConfig> = {},
    featureConfig?: { features: number; enableStructural: boolean }
  ) {
    this.data = data;
    this.config = {
      maxRiskPerTrade: config.maxRiskPerTrade ?? 0.02,
      maxQtyPerAsset: config.maxQtyPerAsset ?? 1000000,
      dailyLossCap: config.dailyLossCap ?? 0.06,
      maxLeverage: config.maxLeverage ?? 3.0,
      pointValue: config.pointValue ?? 1.0,
      initialEquity: config.initialEquity ?? 10000,
      feesMin: config.feesMin ?? 0.0002,
      feesMax: config.feesMax ?? 0.001,
      slippageMin: config.slippageMin ?? 0.0001,
      slippageMax: config.slippageMax ?? 0.0005,
      spreadTicksMin: config.spreadTicksMin ?? 0.5,
      spreadTicksMax: config.spreadTicksMax ?? 2.0
    };
    
    // Default to all 31 features if not specified (backward compatible)
    this.featureConfig = featureConfig || { features: 31, enableStructural: true };
    
    // Initialize risk limit manager
    this.riskLimitManager = new RiskLimitManager();
    
    this.state = this.initializeState();
  }

  private initializeState(): EnvironmentState {
    return {
      equity: this.config.initialEquity,
      drawdown: 0,
      maxDrawdown: 0,
      currentBar: this.sequenceLength, // Start after sequence window
      position: null,
      trades: [],
      dailyPnL: 0,
      lastResetBar: 0
    };
  }

  /**
   * Reset environment for new episode
   */
  reset(): number[][] {
    // Domain randomization: sample episode parameters
    this.episodeFees = this.config.feesMin + Math.random() * (this.config.feesMax - this.config.feesMin);
    this.episodeSlippage = this.config.slippageMin + Math.random() * (this.config.slippageMax - this.config.slippageMin);
    this.episodeSpread = this.config.spreadTicksMin + Math.random() * (this.config.spreadTicksMax - this.config.spreadTicksMin);
    
    // Random start point (leave room for sequence and test period)
    const minStart = Math.max(this.sequenceLength, 100); // Ensure 100-bar lookback for features
    const maxStart = this.data.length - 200; // Reserve 200 bars for episode
    this.state = this.initializeState();
    this.state.currentBar = Math.floor(Math.random() * (maxStart - minStart)) + minStart;
    this.state.lastResetBar = this.state.currentBar;
    
    return this.getSequence();
  }

  /**
   * Get last N bars as feature sequence
   */
  getSequence(length: number = this.sequenceLength): number[][] {
    const endIdx = this.state.currentBar;
    const startIdx = Math.max(0, endIdx - length);
    
    const sequence: number[][] = [];
    
    for (let i = startIdx; i < endIdx; i++) {
      const features = this.extractFeatures(i);
      sequence.push(features);
    }
    
    // Pad if needed (use dynamic feature size from config)
    while (sequence.length < length) {
      sequence.unshift(new Array(this.featureConfig.features).fill(0));
    }
    
    return sequence;
  }

  /**
   * Extract features for a single bar (curriculum learning aware)
   * - 15 features: technicals only (basic stage)
   * - 22 features: technicals + regime + S/R (with_sr stage)
   * - 31 features: all features (full stage)
   */
  private extractFeatures(index: number): number[] {
    const startIdx = Math.max(0, index - 100);
    const windowData = this.data.slice(startIdx, index + 1);
    
    // If we don't have enough data, return zeros (will be padded in getSequence)
    if (windowData.length < 20) {
      return new Array(this.featureConfig.features).fill(0);
    }
    
    // Always calculate technicals (15 features)
    const technicals = calculateTechnicalIndicators(windowData, windowData.length - 1);
    
    // Basic stage: technicals only
    if (this.featureConfig.features === 15) {
      return technicals;
    }
    
    // Calculate structural features for higher stages
    const structural = extractStructuralFeatures(windowData, windowData.length - 1);
    
    // with_sr stage: technicals + regime + S/R (22 features)
    if (this.featureConfig.features === 22) {
      return [
        ...technicals,              // 0-14: 15 features
        structural.reg_acc,         // 15
        structural.reg_adv,         // 16
        structural.reg_dist,        // 17
        structural.reg_decl,        // 18
        structural.vol_regime,      // 19
        structural.dist_to_support, // 20
        structural.dist_to_resistance // 21
      ];
    }
    
    // Full stage: all 31 features
    return [
      ...technicals,                        // 0-14: technicals
      structural.reg_acc,                   // 15
      structural.reg_adv,                   // 16
      structural.reg_dist,                  // 17
      structural.reg_decl,                  // 18
      structural.vol_regime,                // 19
      structural.dist_to_support,           // 20
      structural.dist_to_resistance,        // 21
      structural.sr_strength,               // 22
      structural.dist_127_up,               // 23
      structural.dist_161_up,               // 24
      structural.dist_127_dn,               // 25
      structural.dist_161_dn,               // 26
      structural.dist_38_retrace,           // 27
      structural.dist_61_retrace,           // 28
      structural.last_swing_high ?? 0,      // 29
      structural.last_swing_low ?? 0        // 30
    ];
  }

  /**
   * Execute one step in the environment
   */
  step(action: HybridAction): StepResult {
    // Check if episode is done
    if (this.state.currentBar >= this.data.length - 1) {
      return {
        nextState: this.getSequence(),
        reward: 0,
        done: true,
        info: {
          equity: this.state.equity,
          drawdown: this.state.drawdown,
          position: this.state.position
        }
      };
    }

    // 1. RISK LIMIT CHECKS - Before any action
    const violation = this.riskLimitManager.checkLimits(this.state, this.config);
    if (violation) {
      console.log(`⚠️ Risk violation detected: ${violation.type} (${violation.severity})`);
      
      const breachResponse = handleRiskBreach(violation, this.state);
      
      if (breachResponse.shouldFlatten && this.state.position) {
        // Force close position due to critical risk breach
        const tradeResult = this.closePosition('risk_breach' as any);
        this.riskLimitManager.setCooldown(breachResponse.cooldownBars);
        
        this.anomalies.push({
          bar: this.state.currentBar,
          type: 'risk_breach',
          details: `${violation.type}: ${violation.details}. Flattened position, cooldown: ${breachResponse.cooldownBars} bars`,
          autoCorrected: true
        });
        
        return {
          nextState: this.getSequence(),
          reward: breachResponse.penalty,
          done: false,
          info: {
            trade: tradeResult,
            equity: this.state.equity,
            drawdown: this.state.drawdown,
            position: null
          }
        };
      }
    }

    // 2. COOLDOWN CHECK
    if (this.riskLimitManager.isInCooldown()) {
      this.riskLimitManager.decrementCooldown();
      
      // Force action to HOLD during cooldown
      if (action.direction !== 0) {
        console.log(`🚫 Action masked due to cooldown (${this.riskLimitManager.getCooldownRemaining()} bars remaining)`);
        action = { ...action, direction: 0 };
        
        this.anomalies.push({
          bar: this.state.currentBar,
          type: 'cooldown_mask',
          details: `Action overridden to HOLD during cooldown period`,
          autoCorrected: true
        });
      }
    }

    let reward = 0;
    let tradeResult: TradeResult | undefined;

    // If we have a position, check for TP/SL hits
    if (this.state.position) {
      const exitInfo = this.checkPositionExit();
      if (exitInfo) {
        tradeResult = this.closePosition(exitInfo.reason);
        reward = this.calculateReward(tradeResult);
      }
    }

    // 3. ACTION MASKING - Apply before opening new position
    if (!this.state.position && action.direction !== 0) {
      const structural = this.getStructuralFeatures(this.state.currentBar);
      const mask = applyActionMask(this.getSequence(), structural, 0.5);
      
      const { action: maskedAction, wasOverridden } = overrideMaskedAction(action.direction, mask);
      
      if (wasOverridden) {
        console.log(`🚫 Action masked: ${mask.reason} (confluence: ${mask.confluenceScore.toFixed(2)})`);
        
        this.anomalies.push({
          bar: this.state.currentBar,
          type: 'action_masked',
          details: `Direction ${action.direction} masked: ${mask.reason}. Confluence: ${mask.confluenceScore.toFixed(2)}`,
          autoCorrected: true
        });
        
        action = { ...action, direction: maskedAction };
      }
      
      // Open position if action is still non-flat after masking
      if (action.direction !== 0) {
        tradeResult = this.openPosition(action);
        // No immediate reward for opening (reward comes on close)
      }
    }

    // Advance to next bar
    this.state.currentBar++;

    // Check if we should reset daily PnL (using 24 bars per day for daily data)
    if (shouldResetDailyPnL(this.state.currentBar, this.state.lastResetBar, 24)) {
      this.state.dailyPnL = 0;
      this.state.lastResetBar = this.state.currentBar;
    }

    // Update drawdown
    const peak = this.config.initialEquity;
    this.state.drawdown = (peak - this.state.equity) / peak;
    this.state.maxDrawdown = Math.max(this.state.maxDrawdown, this.state.drawdown);

    const done = this.state.currentBar >= this.data.length - 1;

    return {
      nextState: this.getSequence(),
      reward,
      done,
      info: {
        trade: tradeResult,
        equity: this.state.equity,
        drawdown: this.state.drawdown,
        position: this.state.position
      }
    };
  }

  /**
   * Open a new position with exact TP/SL formulas + validation
   */
  private openPosition(action: HybridAction): TradeResult | undefined {
    // Bounds check
    if (this.state.currentBar >= this.data.length) {
      console.error(`❌ currentBar ${this.state.currentBar} exceeds data length ${this.data.length}`);
      return undefined;
    }

    const bar = this.data[this.state.currentBar];
    
    // Null check
    if (!bar || bar.close === undefined) {
      console.error(`❌ Invalid bar at index ${this.state.currentBar}:`, bar);
      return undefined;
    }
    
    const structural = this.getStructuralFeatures(this.state.currentBar);
    
    const P_entry = bar.close;
    const ATR = structural.atr;
    
    let tp: number;
    let sl: number;
    let chosenFibLevel: number;
    const direction = action.direction === 1 ? 'long' : 'short';

    if (direction === 'long') {
      // Select closer Fib extension upward
      const fib127_up = P_entry + 1.27 * ATR * Math.abs(structural.dist_127_up);
      const fib161_up = P_entry + 1.618 * ATR * Math.abs(structural.dist_161_up);
      chosenFibLevel = Math.abs(fib127_up - P_entry) < Math.abs(fib161_up - P_entry) ? fib127_up : fib161_up;
      
      // TP = fib_target_up + tp_offset * ATR
      tp = chosenFibLevel + action.tp_offset * ATR;
      
      // SL base = nearest support (fallback: P_entry - 1.0*ATR)
      const supportPrice = structural.dist_to_support > 0 
        ? P_entry - structural.dist_to_support * ATR 
        : P_entry - 1.0 * ATR;
      
      // SL = SL_base - sl_tight * ATR
      sl = supportPrice - action.sl_tight * ATR;
      
      // Enforce SL < P_entry and bounds
      sl = Math.min(sl, P_entry - 0.3 * ATR);
      sl = Math.max(sl, P_entry - 6.0 * ATR);
      
      // Enforce TP > P_entry and bounds
      tp = Math.max(tp, P_entry + 0.3 * ATR);
      tp = Math.min(tp, P_entry + 6.0 * ATR);
      
    } else {
      // SHORT
      // Select closer Fib extension downward
      const fib127_dn = P_entry - 1.27 * ATR * Math.abs(structural.dist_127_dn);
      const fib161_dn = P_entry - 1.618 * ATR * Math.abs(structural.dist_161_dn);
      chosenFibLevel = Math.abs(P_entry - fib127_dn) < Math.abs(P_entry - fib161_dn) ? fib127_dn : fib161_dn;
      
      // TP = fib_target_dn - tp_offset * ATR
      tp = chosenFibLevel - action.tp_offset * ATR;
      
      // SL base = nearest resistance (fallback: P_entry + 1.0*ATR)
      const resistancePrice = structural.dist_to_resistance > 0 
        ? P_entry + structural.dist_to_resistance * ATR 
        : P_entry + 1.0 * ATR;
      
      // SL = SL_base + sl_tight * ATR
      sl = resistancePrice + action.sl_tight * ATR;
      
      // Enforce SL > P_entry and bounds
      sl = Math.max(sl, P_entry + 0.3 * ATR);
      sl = Math.min(sl, P_entry + 6.0 * ATR);
      
      // Enforce TP < P_entry and bounds
      tp = Math.min(tp, P_entry - 0.3 * ATR);
      tp = Math.max(tp, P_entry - 6.0 * ATR);
    }

    // VALIDATE AND AUTO-CORRECT TP/SL
    const validation = this.validateTPSL(direction, P_entry, tp, sl, ATR);
    if (!validation.valid) {
      console.log(`⚠️ TP/SL validation failed, auto-correcting...`);
      tp = validation.correctedTP;
      sl = validation.correctedSL;
      
      this.anomalies.push({
        bar: this.state.currentBar,
        type: 'tpsl_invalid',
        details: `TP/SL corrected: ${validation.anomalies.join(', ')}`,
        autoCorrected: true
      });
    }

    // Position sizing with risk validation
    const risk_dollars = action.size * this.config.maxRiskPerTrade * this.state.equity;
    const stop_distance = Math.abs(P_entry - sl);
    let qty = risk_dollars / (stop_distance * this.config.pointValue);
    
    // VALIDATE POSITION SIZE
    const sizeValidation = validatePositionSize(qty, P_entry, sl, this.state.equity, this.config);
    if (!sizeValidation.valid) {
      console.log(`⚠️ Position size adjusted: ${sizeValidation.reason}`);
      qty = sizeValidation.adjustedQty;
      
      this.anomalies.push({
        bar: this.state.currentBar,
        type: 'position_size_adjusted',
        details: sizeValidation.reason || 'Position size exceeded risk limits',
        autoCorrected: true
      });
    }
    
    qty = Math.max(qty, 0.001); // Minimum quantity

    // Apply entry fees and slippage
    const entryFees = P_entry * qty * this.episodeFees;
    const entrySlippage = P_entry * qty * this.episodeSlippage;
    
    this.state.equity -= (entryFees + entrySlippage);

    // Calculate confluence score for this entry
    const confluenceScore = this.calculateConfluenceScore(structural, direction, action);

    this.state.position = {
      direction,
      entryPrice: P_entry,
      entryBar: this.state.currentBar,
      quantity: qty,
      tp,
      sl,
      chosenFibLevel,
      confluenceScore
    };

    return undefined; // No trade result until close
  }

  /**
   * Check if position should be closed (TP/SL hit)
   */
  private checkPositionExit(): { reason: 'tp' | 'sl' | 'timeout' } | null {
    if (!this.state.position) return null;

    const bar = this.data[this.state.currentBar];
    const pos = this.state.position;

    // Randomize intrabar hit order to avoid TP-first bias
    const checkTPFirst = Math.random() < 0.5;

    if (checkTPFirst) {
      // Check TP first
      if (pos.direction === 'long' && bar.high >= pos.tp) {
        return { reason: 'tp' };
      }
      if (pos.direction === 'short' && bar.low <= pos.tp) {
        return { reason: 'tp' };
      }
      // Then check SL
      if (pos.direction === 'long' && bar.low <= pos.sl) {
        return { reason: 'sl' };
      }
      if (pos.direction === 'short' && bar.high >= pos.sl) {
        return { reason: 'sl' };
      }
    } else {
      // Check SL first
      if (pos.direction === 'long' && bar.low <= pos.sl) {
        return { reason: 'sl' };
      }
      if (pos.direction === 'short' && bar.high >= pos.sl) {
        return { reason: 'sl' };
      }
      // Then check TP
      if (pos.direction === 'long' && bar.high >= pos.tp) {
        return { reason: 'tp' };
      }
      if (pos.direction === 'short' && bar.low <= pos.tp) {
        return { reason: 'tp' };
      }
    }

    // Timeout after 100 bars
    if (this.state.currentBar - pos.entryBar > 100) {
      return { reason: 'timeout' };
    }

    return null;
  }

  /**
   * Validate TP/SL placement and auto-correct if needed
   */
  private validateTPSL(
    direction: 'long' | 'short',
    entry: number,
    tp: number,
    sl: number,
    atr: number
  ): { valid: boolean; correctedTP: number; correctedSL: number; anomalies: string[] } {
    const anomalies: string[] = [];
    let correctedTP = tp;
    let correctedSL = sl;
    
    // Check TP/SL on correct side of entry
    if (direction === 'long') {
      if (tp <= entry) {
        anomalies.push(`TP below entry: ${tp.toFixed(4)} <= ${entry.toFixed(4)}`);
        correctedTP = entry + 2.0 * atr;
      }
      if (sl >= entry) {
        anomalies.push(`SL above entry: ${sl.toFixed(4)} >= ${entry.toFixed(4)}`);
        correctedSL = entry - 1.0 * atr;
      }
    } else {
      if (tp >= entry) {
        anomalies.push(`TP above entry: ${tp.toFixed(4)} >= ${entry.toFixed(4)}`);
        correctedTP = entry - 2.0 * atr;
      }
      if (sl <= entry) {
        anomalies.push(`SL below entry: ${sl.toFixed(4)} <= ${entry.toFixed(4)}`);
        correctedSL = entry + 1.0 * atr;
      }
    }
    
    // Check TP/SL bounds [0.3, 6.0] × ATR
    const tpDist = Math.abs(correctedTP - entry);
    const slDist = Math.abs(correctedSL - entry);
    
    if (tpDist < 0.3 * atr) {
      correctedTP = direction === 'long' ? entry + 0.3 * atr : entry - 0.3 * atr;
      anomalies.push(`TP too close: ${(tpDist / atr).toFixed(2)} ATR`);
    }
    if (tpDist > 6.0 * atr) {
      correctedTP = direction === 'long' ? entry + 6.0 * atr : entry - 6.0 * atr;
      anomalies.push(`TP too far: ${(tpDist / atr).toFixed(2)} ATR`);
    }
    
    if (slDist < 0.3 * atr) {
      correctedSL = direction === 'long' ? entry - 0.3 * atr : entry + 0.3 * atr;
      anomalies.push(`SL too close: ${(slDist / atr).toFixed(2)} ATR`);
    }
    if (slDist > 6.0 * atr) {
      correctedSL = direction === 'long' ? entry - 6.0 * atr : entry + 6.0 * atr;
      anomalies.push(`SL too far: ${(slDist / atr).toFixed(2)} ATR`);
    }
    
    return {
      valid: anomalies.length === 0,
      correctedTP,
      correctedSL,
      anomalies
    };
  }

  /**
   * Close position and calculate trade result
   */
  private closePosition(reason: 'tp' | 'sl' | 'timeout' | 'daily_loss_cap' | 'risk_breach'): TradeResult {
    if (!this.state.position) {
      throw new Error('No position to close');
    }

    const pos = this.state.position;
    const bar = this.data[this.state.currentBar];
    
    let exitPrice: number;
    const hitTP = reason === 'tp';
    const hitSL = reason === 'sl';

    if (hitTP) {
      exitPrice = pos.tp;
    } else if (hitSL) {
      exitPrice = pos.sl;
    } else {
      exitPrice = bar.close; // Timeout or forced close
    }

    // Calculate PnL
    const positionSign = pos.direction === 'long' ? 1 : -1;
    const priceDiff = (exitPrice - pos.entryPrice) * positionSign;
    const pnl = priceDiff * pos.quantity * this.config.pointValue;
    const pnlPercent = priceDiff / pos.entryPrice;

    // Apply exit fees and slippage
    const exitFees = exitPrice * pos.quantity * this.episodeFees;
    const exitSlippage = exitPrice * pos.quantity * this.episodeSlippage;
    
    const netPnL = pnl - exitFees - exitSlippage;

    // Update equity
    this.state.equity += netPnL;
    this.state.dailyPnL += netPnL;

    // Calculate Fibonacci alignment if TP hit
    let fibAlignment: number | undefined;
    if (hitTP) {
      const structural = this.getStructuralFeatures(this.state.currentBar);
      const distanceToFib = Math.abs(exitPrice - pos.chosenFibLevel) / structural.atr;
      fibAlignment = 1 / (1 + distanceToFib);
    }

    const tradeResult: TradeResult = {
      direction: pos.direction,
      entryPrice: pos.entryPrice,
      exitPrice,
      entryBar: pos.entryBar,
      exitBar: this.state.currentBar,
      pnl: netPnL,
      pnlPercent,
      hitTP,
      hitSL,
      fees: exitFees,
      slippage: exitSlippage,
      quantity: pos.quantity,
      tpDistance: Math.abs(pos.tp - pos.entryPrice) / this.getStructuralFeatures(pos.entryBar).atr,
      slDistance: Math.abs(pos.sl - pos.entryPrice) / this.getStructuralFeatures(pos.entryBar).atr,
      confluenceScore: pos.confluenceScore,
      fibAlignment
    };

    this.state.trades.push(tradeResult);
    this.state.position = null;

    return tradeResult;
  }

  /**
   * Calculate confluence score for entry decision
   */
  private calculateConfluenceScore(structural: StructuralFeatures, direction: 'long' | 'short', action: HybridAction): number {
    let score = 0;

    // Regime alignment (0.3 weight)
    if (direction === 'long' && structural.reg_adv > 0.5) score += 0.3;
    if (direction === 'short' && structural.reg_decl > 0.5) score += 0.3;

    // S/R proximity (0.3 weight)
    if (direction === 'long' && structural.dist_to_support < 2.0 && structural.dist_to_support > 0) {
      score += 0.3 * (1 - structural.dist_to_support / 2.0);
    }
    if (direction === 'short' && structural.dist_to_resistance < 2.0 && structural.dist_to_resistance > 0) {
      score += 0.3 * (1 - structural.dist_to_resistance / 2.0);
    }

    // Fib plausibility (0.2 weight)
    const fibDist = direction === 'long' ? structural.dist_127_up : structural.dist_127_dn;
    if (Math.abs(fibDist) < 3.0) {
      score += 0.2 * (1 - Math.abs(fibDist) / 3.0);
    }

    // Volatility context (0.2 weight)
    if (structural.vol_regime === 1) score += 0.2; // Mid volatility is optimal
    if (structural.vol_regime === 0) score += 0.1; // Low vol is acceptable

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Calculate reward for a completed trade
   */
  private calculateReward(trade: TradeResult): number {
    // Base reward: PnL scaled
    let reward = trade.pnl / this.config.initialEquity * 200;

    // Structural shaping
    if (trade.hitTP && trade.fibAlignment) {
      reward *= (1.0 + 0.10 * trade.fibAlignment);
    }
    if (trade.hitSL) {
      reward *= 0.80;
    }
    reward *= (1.0 + 0.20 * trade.confluenceScore);

    // Drawdown penalty
    const deltaMDD = Math.max(0, this.state.drawdown - 0.15); // Penalty above 15% DD
    reward -= 0.10 * deltaMDD;

    // Turnover penalty
    reward -= 0.01;

    return reward;
  }

  /**
   * Get structural features for a bar
   */
  private getStructuralFeatures(index: number): StructuralFeatures {
    // Ensure we have at least 100 bars of history
    const startIdx = Math.max(0, index - 100);
    const windowData = this.data.slice(startIdx, index + 1);
    
    // If we don't have enough data, return default structural features
    if (windowData.length < 50) {
      console.warn(`⚠️ Insufficient data at index ${index} (only ${windowData.length} bars)`);
      return {
        reg_acc: 0, reg_adv: 0, reg_dist: 0, reg_decl: 0,
        vol_regime: 0, dist_to_support: 1.0, dist_to_resistance: 1.0,
        sr_strength: 0, dist_127_up: 1.0, dist_161_up: 1.5,
        dist_127_dn: 1.0, dist_161_dn: 1.5, dist_38_retrace: 0.5,
        dist_61_retrace: 0.8, atr: windowData[windowData.length - 1]?.close * 0.02 || 1.0,
        last_swing_high: undefined, last_swing_low: undefined
      };
    }
    
    return extractStructuralFeatures(windowData, windowData.length - 1);
  }

  /**
   * Get current environment metrics
   */
  getMetrics() {
    const longTrades = this.state.trades.filter(t => t.direction === 'long');
    const shortTrades = this.state.trades.filter(t => t.direction === 'short');

    return {
      total_reward: this.state.trades.reduce((sum, t) => sum + t.pnl, 0),
      total_trades: this.state.trades.length,
      long_trades: longTrades.length,
      short_trades: shortTrades.length,
      win_rate: this.state.trades.filter(t => t.pnl > 0).length / Math.max(1, this.state.trades.length),
      long_win_rate: longTrades.filter(t => t.pnl > 0).length / Math.max(1, longTrades.length),
      short_win_rate: shortTrades.filter(t => t.pnl > 0).length / Math.max(1, shortTrades.length),
      avg_win: this.state.trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / Math.max(1, this.state.trades.filter(t => t.pnl > 0).length),
      avg_loss: this.state.trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0) / Math.max(1, this.state.trades.filter(t => t.pnl < 0).length),
      max_drawdown: this.state.maxDrawdown,
      final_equity: this.state.equity,
      sharpe_ratio: this.calculateSharpe(),
      confluence_avg: this.state.trades.reduce((sum, t) => sum + t.confluenceScore, 0) / Math.max(1, this.state.trades.length),
      fib_alignment_avg: this.state.trades.filter(t => t.fibAlignment).reduce((sum, t) => sum + (t.fibAlignment || 0), 0) / Math.max(1, this.state.trades.filter(t => t.fibAlignment).length)
    };
  }

  private calculateSharpe(): number {
    if (this.state.trades.length < 2) return 0;
    
    const returns = this.state.trades.map(t => t.pnlPercent);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);
    
    return mean / (std + 1e-8) * Math.sqrt(252); // Annualized
  }
}
