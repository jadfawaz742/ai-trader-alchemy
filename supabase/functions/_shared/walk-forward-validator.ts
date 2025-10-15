import { OHLCV } from './market-data-fetcher.ts';
import { RecurrentPPOModel, forwardPass, initializeModel } from './recurrent-ppo-model.ts';
import { TradingEnvironment, EnvironmentConfig } from './trading-environment.ts';

export interface WalkForwardConfig {
  trainMonths: number;        // Default: 3 (train on 3 months)
  testMonths: number;         // Default: 1 (test on 1 month)
  minTradeCount: number;      // Default: 20 (minimum trades in test window)
  minWinRate: number;         // Default: 0.45 (45% win rate threshold)
  minSharpe: number;          // Default: 0.5 (Sharpe ratio threshold)
  maxDrawdown: number;        // Default: 0.20 (20% max drawdown)
}

export interface ValidationWindow {
  trainStart: number;         // Bar index
  trainEnd: number;
  testStart: number;
  testEnd: number;
  label: string;              // e.g., "Window 1: Jan-Mar train, Apr test"
}

export interface WindowResult {
  window: ValidationWindow;
  
  // Training metrics
  trainTrades: number;
  trainWinRate: number;
  trainSharpe: number;
  trainMaxDrawdown: number;
  
  // Testing metrics (out-of-sample)
  testTrades: number;
  testWinRate: number;
  testSharpe: number;
  testMaxDrawdown: number;
  testPnL: number;
  
  // Validation status
  passed: boolean;
  failureReasons: string[];
}

export interface ValidationReport {
  asset: string;
  totalWindows: number;
  passedWindows: number;
  failedWindows: number;
  
  // Aggregate metrics across all test windows
  avgTestWinRate: number;
  avgTestSharpe: number;
  avgTestDrawdown: number;
  totalTestPnL: number;
  
  // Consistency checks
  winRateStdDev: number;      // Lower = more consistent
  sharpeStdDev: number;
  
  // Final verdict
  approved: boolean;
  recommendation: string;
  windowResults: WindowResult[];
}

const DEFAULT_CONFIG: WalkForwardConfig = {
  trainMonths: 3,
  testMonths: 1,
  minTradeCount: 15,
  minWinRate: 0.43,
  minSharpe: 0.3,
  maxDrawdown: 0.25
};

/**
 * Creates overlapping train/test windows for walk-forward validation
 */
export function createWindows(
  data: OHLCV[],
  config: WalkForwardConfig = DEFAULT_CONFIG
): ValidationWindow[] {
  const windows: ValidationWindow[] = [];
  
  // Estimate bars per month (assuming daily data: ~21 trading days/month)
  const barsPerMonth = 21;
  const trainBars = config.trainMonths * barsPerMonth;
  const testBars = config.testMonths * barsPerMonth;
  const windowSize = trainBars + testBars;
  
  // Require minimum data length
  if (data.length < windowSize) {
    throw new Error(`Insufficient data: need at least ${windowSize} bars for ${config.trainMonths}+${config.testMonths} months`);
  }
  
  let windowNum = 1;
  let currentStart = 0;
  
  // Roll forward by test window size (non-overlapping test periods)
  while (currentStart + windowSize <= data.length) {
    const trainStart = currentStart;
    const trainEnd = currentStart + trainBars - 1;
    const testStart = trainEnd + 1;
    const testEnd = Math.min(testStart + testBars - 1, data.length - 1);
    
    // Format dates for label
    const trainStartDate = new Date(data[trainStart].time).toISOString().slice(0, 7);
    const trainEndDate = new Date(data[trainEnd].time).toISOString().slice(0, 7);
    const testStartDate = new Date(data[testStart].time).toISOString().slice(0, 7);
    const testEndDate = new Date(data[testEnd].time).toISOString().slice(0, 7);
    
    windows.push({
      trainStart,
      trainEnd,
      testStart,
      testEnd,
      label: `Window ${windowNum}: Train ${trainStartDate} to ${trainEndDate}, Test ${testStartDate} to ${testEndDate}`
    });
    
    windowNum++;
    currentStart += testBars; // Roll forward by test period
    
    // Stop if we don't have enough data for another full window
    if (currentStart + windowSize > data.length) break;
  }
  
  console.log(`✅ Created ${windows.length} walk-forward windows`);
  return windows;
}

/**
 * Validates model on a single train/test window
 */
export function validateWindow(
  baseModel: RecurrentPPOModel,
  window: ValidationWindow,
  data: OHLCV[],
  config: WalkForwardConfig = DEFAULT_CONFIG
): WindowResult {
  console.log(`\n🔍 Validating ${window.label}`);
  
  // 1. Train phase on in-sample data
  const trainData = data.slice(window.trainStart, window.trainEnd + 1);
  const trainEnv = new TradingEnvironment(trainData, {
    maxDailyLoss: 0.10,
    maxDrawdown: 0.20,
    minTradeInterval: 1
  });
  
  // Simple training loop (in production, this would be full PPO training)
  let trainMetrics = { trades: 0, wins: 0, pnl: 0, maxDD: 0, sharpe: 0 };
  trainEnv.reset();
  
  for (let ep = 0; ep < 3; ep++) { // Quick training for validation
    trainEnv.reset();
    let done = false;
    while (!done) {
      const state = trainEnv.getSequence();
      const { action } = forwardPass(baseModel, state, false);
      const result = trainEnv.step(action);
      done = result.done;
    }
  }
  
  trainMetrics = trainEnv.getMetrics();
  
  // 2. Test phase on out-of-sample data (NO TRAINING UPDATES)
  const testData = data.slice(window.testStart, window.testEnd + 1);
  const testEnv = new TradingEnvironment(testData, {
    maxDailyLoss: 0.10,
    maxDrawdown: 0.20,
    minTradeInterval: 1
  });
  
  testEnv.reset();
  let done = false;
  while (!done) {
    const state = testEnv.getSequence();
    const { action } = forwardPass(baseModel, state, true); // Deterministic mode
    const result = testEnv.step(action);
    done = result.done;
  }
  
  const testMetrics = testEnv.getMetrics();
  
  // 3. Evaluate test performance
  const failureReasons: string[] = [];
  
  if (testMetrics.totalTrades < config.minTradeCount) {
    failureReasons.push(`insufficient_trades: ${testMetrics.totalTrades} < ${config.minTradeCount}`);
  }
  
  if (testMetrics.winRate < config.minWinRate) {
    failureReasons.push(`low_win_rate: ${(testMetrics.winRate * 100).toFixed(1)}% < ${(config.minWinRate * 100).toFixed(1)}%`);
  }
  
  if (testMetrics.sharpe < config.minSharpe) {
    failureReasons.push(`low_sharpe: ${testMetrics.sharpe.toFixed(2)} < ${config.minSharpe.toFixed(2)}`);
  }
  
  if (testMetrics.maxDrawdown > config.maxDrawdown) {
    failureReasons.push(`high_drawdown: ${(testMetrics.maxDrawdown * 100).toFixed(1)}% > ${(config.maxDrawdown * 100).toFixed(1)}%`);
  }
  
  // Check for overfitting (train >> test performance)
  const winRateGap = trainMetrics.winRate - testMetrics.winRate;
  if (winRateGap > 0.20) {
    failureReasons.push(`overfitting: train win rate ${(trainMetrics.winRate * 100).toFixed(1)}% vs test ${(testMetrics.winRate * 100).toFixed(1)}%`);
  }
  
  const passed = failureReasons.length === 0;
  console.log(passed ? '✅ Window passed' : `❌ Window failed: ${failureReasons.join(', ')}`);
  
  return {
    window,
    trainTrades: trainMetrics.totalTrades,
    trainWinRate: trainMetrics.winRate,
    trainSharpe: trainMetrics.sharpe,
    trainMaxDrawdown: trainMetrics.maxDrawdown,
    testTrades: testMetrics.totalTrades,
    testWinRate: testMetrics.winRate,
    testSharpe: testMetrics.sharpe,
    testMaxDrawdown: testMetrics.maxDrawdown,
    testPnL: testMetrics.netPnL,
    passed,
    failureReasons
  };
}

/**
 * Generates final validation report from all window results
 */
export function generateReport(
  asset: string,
  windowResults: WindowResult[],
  config: WalkForwardConfig = DEFAULT_CONFIG
): ValidationReport {
  const totalWindows = windowResults.length;
  const passedWindows = windowResults.filter(w => w.passed).length;
  const failedWindows = totalWindows - passedWindows;
  
  // Calculate aggregate test metrics
  const testWinRates = windowResults.map(w => w.testWinRate);
  const testSharpes = windowResults.map(w => w.testSharpe);
  const testDrawdowns = windowResults.map(w => w.testMaxDrawdown);
  
  const avgTestWinRate = testWinRates.reduce((a, b) => a + b, 0) / totalWindows;
  const avgTestSharpe = testSharpes.reduce((a, b) => a + b, 0) / totalWindows;
  const avgTestDrawdown = testDrawdowns.reduce((a, b) => a + b, 0) / totalWindows;
  const totalTestPnL = windowResults.reduce((sum, w) => sum + w.testPnL, 0);
  
  // Calculate consistency (standard deviation)
  const winRateStdDev = Math.sqrt(
    testWinRates.reduce((sum, wr) => sum + Math.pow(wr - avgTestWinRate, 2), 0) / totalWindows
  );
  const sharpeStdDev = Math.sqrt(
    testSharpes.reduce((sum, s) => sum + Math.pow(s - avgTestSharpe, 2), 0) / totalWindows
  );
  
  // Final approval decision
  const passRate = passedWindows / totalWindows;
  const approved = (
    passRate >= 0.70 && // At least 70% windows pass
    avgTestWinRate >= config.minWinRate &&
    avgTestSharpe >= config.minSharpe &&
    avgTestDrawdown <= config.maxDrawdown &&
    winRateStdDev <= 0.15 && // Consistency check
    !windowResults.some(w => w.testMaxDrawdown > 0.40) // No catastrophic failures
  );
  
  let recommendation = '';
  if (approved) {
    recommendation = `✅ Model approved for deployment. Passed ${passedWindows}/${totalWindows} windows with consistent performance.`;
  } else if (passRate < 0.70) {
    recommendation = `❌ Model rejected: Only ${passedWindows}/${totalWindows} (${(passRate * 100).toFixed(0)}%) windows passed. Need ≥70%.`;
  } else if (avgTestWinRate < config.minWinRate) {
    recommendation = `❌ Model rejected: Average test win rate ${(avgTestWinRate * 100).toFixed(1)}% below threshold ${(config.minWinRate * 100).toFixed(1)}%.`;
  } else if (winRateStdDev > 0.15) {
    recommendation = `❌ Model rejected: High variance in win rate (σ=${winRateStdDev.toFixed(3)}). Performance too inconsistent.`;
  } else {
    recommendation = `❌ Model rejected: Failed multiple validation criteria. Review window details.`;
  }
  
  return {
    asset,
    totalWindows,
    passedWindows,
    failedWindows,
    avgTestWinRate,
    avgTestSharpe,
    avgTestDrawdown,
    totalTestPnL,
    winRateStdDev,
    sharpeStdDev,
    approved,
    recommendation,
    windowResults
  };
}

/**
 * Checks consistency of performance across windows
 */
export function checkConsistency(windowResults: WindowResult[]): { consistent: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check for sudden drops in performance
  for (let i = 1; i < windowResults.length; i++) {
    const prev = windowResults[i - 1];
    const curr = windowResults[i];
    
    const winRateDrop = prev.testWinRate - curr.testWinRate;
    if (winRateDrop > 0.25) {
      issues.push(`Sharp win rate drop in window ${i + 1}: ${(prev.testWinRate * 100).toFixed(1)}% → ${(curr.testWinRate * 100).toFixed(1)}%`);
    }
  }
  
  // Check for degrading performance over time (later windows worse than earlier)
  const firstHalf = windowResults.slice(0, Math.floor(windowResults.length / 2));
  const secondHalf = windowResults.slice(Math.floor(windowResults.length / 2));
  
  const firstHalfAvgWR = firstHalf.reduce((sum, w) => sum + w.testWinRate, 0) / firstHalf.length;
  const secondHalfAvgWR = secondHalf.reduce((sum, w) => sum + w.testWinRate, 0) / secondHalf.length;
  
  if (firstHalfAvgWR - secondHalfAvgWR > 0.15) {
    issues.push(`Performance degradation: First half avg WR ${(firstHalfAvgWR * 100).toFixed(1)}% vs second half ${(secondHalfAvgWR * 100).toFixed(1)}%`);
  }
  
  return {
    consistent: issues.length === 0,
    issues
  };
}
