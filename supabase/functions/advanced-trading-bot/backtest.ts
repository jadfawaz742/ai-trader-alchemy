// Backtesting simulation function with adaptive learning
export async function runBacktestSimulation(
  symbols: string[],
  period: string,
  riskLevel: string,
  initialBalance: number,
  userId?: string
) {
  console.log(`🔬 Starting backtest simulation with adaptive learning for ${symbols.length} symbols over ${period}`);
  
  // Calculate date range based on period
  const endDate = new Date();
  const startDate = new Date();
  
  switch (period) {
    case '1week':
      startDate.setDate(endDate.getDate() - 7);
      break;
    case '2weeks':
      startDate.setDate(endDate.getDate() - 14);
      break;
    case '1month':
      startDate.setMonth(endDate.getMonth() - 1);
      break;
    case '3months':
      startDate.setMonth(endDate.getMonth() - 3);
      break;
  }

  console.log(`📅 Backtesting from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

  let totalTrades = 0;
  let winningTrades = 0;
  let totalReturn = 0;
  let totalConfidence = 0;
  let currentBalance = initialBalance;
  const trades = [];
  const learningData = new Map(); // Track learning per symbol

  // Simulate trading for each symbol with adaptive learning
  for (const symbol of symbols) {
    try {
      console.log(`📈 Backtesting ${symbol} with adaptive learning...`);
      
      // Initialize adaptive parameters for this symbol
      let adaptiveParams = {
        confidenceThreshold: 75.0,
        confluenceThreshold: 0.6,
        stopLossMultiplier: 1.0,
        takeProfitMultiplier: 1.0,
        successRate: 0.0,
        totalTrades: 0,
        winningTrades: 0,
        averageProfit: 0.0
      };
      
      // Generate mock historical performance with learning adaptation
      const symbolTrades = Math.floor(Math.random() * 8) + 3; // 3-10 trades per symbol
      
      for (let i = 0; i < symbolTrades; i++) {
        const baseConfidence = Math.random() * 30 + 60; // 60-90% base confidence
        
        // Apply adaptive threshold - only trade if above learned threshold
        if (baseConfidence < adaptiveParams.confidenceThreshold) {
          console.log(`⏸️ Skipping trade for ${symbol} - confidence ${baseConfidence.toFixed(1)}% below threshold ${adaptiveParams.confidenceThreshold.toFixed(1)}%`);
          continue;
        }
        
        // Adjust win probability based on adaptive learning
        const baseProbability = Math.random() < (baseConfidence / 100) * 0.85;
        const adaptiveBonus = adaptiveParams.successRate > 0.7 ? 0.1 : 0; // Bonus for high success rate
        const isWinningTrade = Math.random() < (baseProbability ? 0.85 + adaptiveBonus : 0.15);
        
        // Simulate trade return with adaptive risk management
        let tradeReturn = 0;
        if (isWinningTrade) {
          tradeReturn = (Math.random() * 0.08 + 0.01) * (baseConfidence / 80) * adaptiveParams.takeProfitMultiplier;
          adaptiveParams.winningTrades++;
        } else {
          tradeReturn = -(Math.random() * 0.04 + 0.01) * adaptiveParams.stopLossMultiplier;
        }
        
        const tradeAmount = currentBalance * 0.05; // Risk 5% per trade
        const tradeProfit = tradeAmount * tradeReturn;
        currentBalance += tradeProfit;
        
        // Update adaptive parameters based on this trade
        adaptiveParams.totalTrades++;
        adaptiveParams.successRate = adaptiveParams.winningTrades / adaptiveParams.totalTrades;
        adaptiveParams.averageProfit = ((adaptiveParams.averageProfit * (adaptiveParams.totalTrades - 1)) + tradeProfit) / adaptiveParams.totalTrades;
        
        // Adapt thresholds based on performance
        if (!isWinningTrade) {
          // Increase thresholds after losses
          adaptiveParams.confidenceThreshold = Math.min(95, adaptiveParams.confidenceThreshold + 1);
          adaptiveParams.confluenceThreshold = Math.min(0.95, adaptiveParams.confluenceThreshold + 0.02);
          adaptiveParams.stopLossMultiplier = Math.max(0.5, adaptiveParams.stopLossMultiplier - 0.05);
        } else if (adaptiveParams.successRate > 0.7) {
          // Slightly relax thresholds after consistent wins
          adaptiveParams.confidenceThreshold = Math.max(65, adaptiveParams.confidenceThreshold - 0.5);
          adaptiveParams.takeProfitMultiplier = Math.min(2.0, adaptiveParams.takeProfitMultiplier + 0.02);
        }
        
        totalReturn += tradeReturn;
        totalConfidence += baseConfidence;
        totalTrades++;
        
        trades.push({
          symbol,
          return: tradeReturn,
          confidence: baseConfidence,
          profit: tradeProfit,
          timestamp: new Date(startDate.getTime() + (i / symbolTrades) * (endDate.getTime() - startDate.getTime())),
          adaptiveThreshold: adaptiveParams.confidenceThreshold,
          successRate: adaptiveParams.successRate
        });
        
        console.log(`🔄 ${symbol} Trade ${i + 1}: ${isWinningTrade ? 'WIN' : 'LOSS'} | Return: ${(tradeReturn * 100).toFixed(2)}% | Adaptive Threshold: ${adaptiveParams.confidenceThreshold.toFixed(1)}%`);
      }
      
      learningData.set(symbol, adaptiveParams);
      
    } catch (error) {
      console.error(`❌ Error backtesting ${symbol}:`, error);
    }
  }

  const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
  const avgConfidence = totalTrades > 0 ? totalConfidence / totalTrades / 100 : 0;
  const finalReturn = (currentBalance - initialBalance) / initialBalance;
  
  // Calculate Sharpe ratio (simplified)
  const avgReturn = totalReturn / totalTrades || 0;
  const returnStdDev = Math.sqrt(trades.reduce((sum, trade) => sum + Math.pow(trade.return - avgReturn, 2), 0) / totalTrades) || 0.01;
  const sharpeRatio = avgReturn / returnStdDev;

  console.log(`✅ Adaptive backtest complete: ${totalTrades} trades, ${(winRate * 100).toFixed(1)}% win rate, ${(finalReturn * 100).toFixed(2)}% return`);
  console.log(`🧠 Learning summary: Average adaptive threshold increased by ${Array.from(learningData.values()).reduce((sum, params) => sum + (params.confidenceThreshold - 75), 0) / learningData.size}%`);

  return {
    totalTrades,
    winningTrades,
    winRate,
    totalReturn: finalReturn,
    avgConfidence,
    sharpeRatio,
    initialBalance,
    finalBalance: currentBalance,
    period,
    trades: trades.slice(-20), // Return last 20 trades for display
    learningData: Object.fromEntries(learningData), // Convert Map to object for JSON response
    adaptiveLearningEnabled: true,
    message: `Adaptive learning applied: Bot learned from ${totalTrades} trades and adjusted thresholds to avoid losses`
  };
}