// Backtesting simulation function
export async function runBacktestSimulation(
  symbols: string[],
  period: string,
  riskLevel: string,
  initialBalance: number
) {
  console.log(`🔬 Starting backtest simulation for ${symbols.length} symbols over ${period}`);
  
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

  // Simulate trading for each symbol
  for (const symbol of symbols) {
    try {
      console.log(`📈 Backtesting ${symbol}...`);
      
      // Generate mock historical performance based on realistic trading patterns
      const symbolTrades = Math.floor(Math.random() * 8) + 3; // 3-10 trades per symbol
      
      for (let i = 0; i < symbolTrades; i++) {
        const confidence = Math.random() * 30 + 60; // 60-90% confidence
        const isWinningTrade = Math.random() < (confidence / 100) * 0.85; // Slightly reduce from confidence
        
        // Simulate trade return based on market conditions and confidence
        let tradeReturn = 0;
        if (isWinningTrade) {
          tradeReturn = (Math.random() * 0.08 + 0.01) * (confidence / 80); // 1-8% gain, scaled by confidence
          winningTrades++;
        } else {
          tradeReturn = -(Math.random() * 0.04 + 0.01); // 1-5% loss
        }
        
        const tradeAmount = currentBalance * 0.05; // Risk 5% per trade
        const tradeProfit = tradeAmount * tradeReturn;
        currentBalance += tradeProfit;
        
        totalReturn += tradeReturn;
        totalConfidence += confidence;
        totalTrades++;
        
        trades.push({
          symbol,
          return: tradeReturn,
          confidence: confidence,
          profit: tradeProfit,
          timestamp: new Date(startDate.getTime() + (i / symbolTrades) * (endDate.getTime() - startDate.getTime()))
        });
      }
      
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

  console.log(`✅ Backtest complete: ${totalTrades} trades, ${(winRate * 100).toFixed(1)}% win rate, ${(finalReturn * 100).toFixed(2)}% return`);

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
    trades: trades.slice(-20) // Return last 20 trades for display
  };
}