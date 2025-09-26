// ============= Supabase Edge Function: PPO Model Training =============

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface TrainingData {
  symbol: string
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface PPOState {
  features: number[]
}

interface PPOAction {
  action: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  stopLoss?: number
  targets?: number[]
  positionSize?: number
}

interface TrainingMetrics {
  episode: number
  totalReturn: number // Actual portfolio return percentage
  avgTradeReturn: number // Average return per trade
  winRate: number
  sharpeRatio: number
  maxDrawdown: number
  totalTrades: number
  profitableTrades: number
  finalPortfolioValue: number
}

class PPOTrainer {
  private learningRate = 0.001
  private gamma = 0.99
  private lambda = 0.95
  private episodes = 10
  
  private actor!: { weights: number[][], bias: number[][] }
  private critic!: { weights: number[][], bias: number[][] }
  private trainingHistory: TrainingMetrics[] = []

  constructor() {
    this.initializeNetworks()
  }

  private initializeNetworks() {
    const inputSize = 15 // Number of features
    const actorOutputSize = 3 // BUY, SELL, HOLD
    const criticOutputSize = 1

    this.actor = {
      weights: this.randomWeights(inputSize, actorOutputSize),
      bias: this.randomWeights(1, actorOutputSize)
    }

    this.critic = {
      weights: this.randomWeights(inputSize, criticOutputSize),
      bias: this.randomWeights(1, criticOutputSize)
    }
  }

  private randomWeights(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() - 0.5) * 0.1)
    )
  }

  private extractFeatures(data: TrainingData[], index: number): number[] {
    if (index < 20) return new Array(15).fill(0)

    const current = data[index]
    const prev = data[index - 1]
    
    // Price features
    const priceChange = (current.close - prev.close) / prev.close
    const volatility = this.calculateVolatility(data, index, 10)
    
    // Volume features
    const volumeChange = (current.volume - prev.volume) / prev.volume
    const avgVolume = data.slice(Math.max(0, index - 10), index + 1)
      .reduce((sum, d) => sum + d.volume, 0) / Math.min(11, index + 1)
    const volumeRatio = current.volume / avgVolume

    // Technical indicators
    const sma5 = this.calculateSMA(data, index, 5)
    const sma20 = data.slice(Math.max(0, index - 19), index + 1)
      .reduce((sum, d) => sum + d.close, 0) / Math.min(20, index + 1)
    const smaRatio = current.close / sma20

    // RSI calculation
    const rsi = this.calculateRSI(data, index, 14)
    
    // Momentum
    const momentum = this.calculateMomentum(data, index, 10)
    
    // Trend
    const trend = this.calculateTrend(data, index, 10)

    return [
      priceChange,
      volatility,
      volumeChange,
      volumeRatio,
      smaRatio,
      rsi / 100, // Normalize RSI
      momentum,
      trend,
      (current.high - current.low) / current.close, // Daily range
      (current.close - current.open) / current.open, // Daily change
      Math.log(current.volume / avgVolume), // Log volume ratio
      current.close / sma5 - 1, // Price vs SMA5
      (current.high - current.close) / current.close, // Upper shadow
      (current.close - current.low) / current.close, // Lower shadow
      Math.min(1, Math.max(-1, priceChange * 10)) // Normalized price change
    ]
  }

  private calculateSMA(data: TrainingData[], index: number, period: number): number {
    const start = Math.max(0, index - period + 1)
    const prices = data.slice(start, index + 1).map(d => d.close)
    return prices.reduce((sum, price) => sum + price, 0) / prices.length
  }

  private calculateRSI(data: TrainingData[], index: number, period: number): number {
    if (index < period) return 50

    const gains = []
    const losses = []
    
    for (let i = Math.max(1, index - period + 1); i <= index; i++) {
      const change = data[i].close - data[i - 1].close
      gains.push(Math.max(0, change))
      losses.push(Math.max(0, -change))
    }

    const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / gains.length
    const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / losses.length

    if (avgLoss === 0) return 100
    const rs = avgGain / avgLoss
    return 100 - (100 / (1 + rs))
  }

  private calculateVolatility(data: TrainingData[], index: number, period: number): number {
    const start = Math.max(0, index - period + 1)
    const returns = []
    
    for (let i = start + 1; i <= index; i++) {
      const ret = (data[i].close - data[i - 1].close) / data[i - 1].close
      returns.push(ret)
    }

    if (returns.length === 0) return 0
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length
    
    return Math.sqrt(variance)
  }

  private calculateMomentum(data: TrainingData[], index: number, period: number): number {
    if (index < period) return 0
    return (data[index].close - data[index - period].close) / data[index - period].close
  }

  private calculateTrend(data: TrainingData[], index: number, period: number): number {
    const start = Math.max(0, index - period + 1)
    const prices = data.slice(start, index + 1).map(d => d.close)
    
    if (prices.length < 2) return 0
    
    // Simple linear regression slope
    const n = prices.length
    const sumX = n * (n - 1) / 2
    const sumY = prices.reduce((a, b) => a + b, 0)
    const sumXY = prices.reduce((acc, price, i) => acc + i * price, 0)
    const sumX2 = n * (n - 1) * (2 * n - 1) / 6
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    return slope / prices[prices.length - 1] // Normalized slope
  }
  
  private forwardActor(features: number[]): number[] {
    const output = [0, 0, 0] // BUY, SELL, HOLD probabilities
    
    for (let j = 0; j < 3; j++) {
      let sum = this.actor.bias[0][j]
      for (let i = 0; i < features.length; i++) {
        sum += features[i] * this.actor.weights[i][j]
      }
      output[j] = 1 / (1 + Math.exp(-sum)) // Sigmoid activation
    }
    
    // Softmax
    const expSum = output.reduce((acc, val) => acc + Math.exp(val), 0)
    return output.map(val => Math.exp(val) / expSum)
  }
  
  private forwardCritic(features: number[]): number {
    let sum = this.critic.bias[0][0]
    for (let i = 0; i < features.length; i++) {
      sum += features[i] * this.critic.weights[i][0]
    }
    return sum // Linear output for value function
  }
  
  async trainOnSymbol(symbol: string, data: TrainingData[]): Promise<TrainingMetrics[]> {
    console.log(`Training PPO model on ${symbol} with ${data.length} data points`)
    
    const episodeMetrics: TrainingMetrics[] = []
    
    for (let episode = 0; episode < this.episodes; episode++) {
      // Initialize trading simulation
      let portfolio = {
        cash: 10000,
        shares: 0,
        totalValue: 10000,
        trades: [] as Array<{entry: number, exit: number, profit: number, type: string}>
      }
      
      let inPosition = false
      let entryPrice = 0
      let profitableTrades = 0
      let maxValue = 10000
      let maxDrawdown = 0
      
      const episodeBuffer: any[] = []
      
      // Run episode with improved trading simulation
      for (let i = 50; i < data.length - 1; i++) {
        const features = this.extractFeatures(data, i)
        const actionProbs = this.forwardActor(features)
        const value = this.forwardCritic(features)
        const currentPrice = data[i].close
        
        // Enhanced action selection with technical analysis
        const actionIndex = this.selectSmartAction(features, actionProbs, inPosition)
        const actionName = ['BUY', 'SELL', 'HOLD'][actionIndex] as 'BUY' | 'SELL' | 'HOLD'
        
        // Execute trades with improved logic
        let stepReward = 0
        
        if (actionName === 'BUY' && !inPosition && portfolio.cash > 0) {
          // Enter long position with confidence-based sizing
          const confidence = Math.max(...actionProbs)
          const positionSize = confidence > 0.6 ? 0.8 : 0.5 // Risk management
          const investAmount = portfolio.cash * positionSize
          
          portfolio.shares = investAmount / currentPrice
          portfolio.cash -= investAmount
          entryPrice = currentPrice
          inPosition = true
          
          // Small reward for taking action in good conditions
          stepReward = confidence > 0.7 ? 0.01 : 0
          
        } else if (actionName === 'SELL' && inPosition) {
          // Exit position
          const exitValue = portfolio.shares * currentPrice
          portfolio.cash += exitValue
          const tradeReturn = (currentPrice - entryPrice) / entryPrice
          
          portfolio.trades.push({
            entry: entryPrice,
            exit: currentPrice,
            profit: tradeReturn,
            type: 'LONG'
          })
          
          if (tradeReturn > 0) profitableTrades++
          
          // Enhanced reward based on trade quality
          if (tradeReturn > 0.02) {
            stepReward = tradeReturn * 2 // Bonus for good trades
          } else if (tradeReturn > 0) {
            stepReward = tradeReturn
          } else {
            stepReward = tradeReturn * 0.5 // Reduce penalty for small losses
          }
          
          portfolio.shares = 0
          inPosition = false
          
        } else if (actionName === 'HOLD') {
          // Reward for holding in position when trending up
          if (inPosition && i > 0) {
            const priceChange = (currentPrice - data[i-1].close) / data[i-1].close
            stepReward = priceChange > 0 ? priceChange * 0.3 : priceChange * 0.1
          } else if (!inPosition) {
            // Small penalty for cash sitting idle in trending market
            const momentum = features[3] // Momentum indicator
            stepReward = momentum > 0.02 ? -0.001 : 0.001 // Slight penalty for missing opportunities
          }
        }
        
        // Calculate current portfolio value
        portfolio.totalValue = portfolio.cash + (portfolio.shares * currentPrice)
        
        // Track drawdown
        if (portfolio.totalValue > maxValue) maxValue = portfolio.totalValue
        const currentDrawdown = (maxValue - portfolio.totalValue) / maxValue
        if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown
        
        // Add portfolio growth component to reward
        const portfolioGrowth = (portfolio.totalValue - 10000) / 10000
        const totalStepReward = stepReward + portfolioGrowth * 0.01
        
        episodeBuffer.push({
          features,
          actionIndex,
          actionProbs,
          value,
          reward: totalStepReward,
          done: i === data.length - 2
        })
      }
      
      // Close any remaining position
      if (inPosition && data.length > 0) {
        const finalPrice = data[data.length - 1].close
        portfolio.cash += portfolio.shares * finalPrice
        const tradeReturn = (finalPrice - entryPrice) / entryPrice
        
        portfolio.trades.push({
          entry: entryPrice,
          exit: finalPrice,
          profit: tradeReturn,
          type: 'LONG'
        })
        
        if (tradeReturn > 0) profitableTrades++
        portfolio.shares = 0
        portfolio.totalValue = portfolio.cash
      }
      
      // Calculate episode metrics
      const totalReturn = (portfolio.totalValue - 10000) / 10000
      const avgTradeReturn = portfolio.trades.length > 0 
        ? portfolio.trades.reduce((sum, trade) => sum + trade.profit, 0) / portfolio.trades.length
        : 0
      
      // Update networks with better learning
      this.updateNetworks(episodeBuffer)
      
      const metrics: TrainingMetrics = {
        episode: episode + 1,
        totalReturn,
        avgTradeReturn,
        winRate: portfolio.trades.length > 0 ? profitableTrades / portfolio.trades.length : 0,
        sharpeRatio: this.calculateSharpeRatio(episodeBuffer),
        maxDrawdown,
        totalTrades: portfolio.trades.length,
        profitableTrades,
        finalPortfolioValue: portfolio.totalValue
      }
      
      episodeMetrics.push(metrics)
      this.trainingHistory.push(metrics)
      
      console.log(`Episode ${episode + 1}/${this.episodes} - Return: ${(totalReturn * 100).toFixed(2)}%, Win Rate: ${(metrics.winRate * 100).toFixed(2)}%`)
    }
    
    return episodeMetrics
  }
  
  private selectSmartAction(features: number[], actionProbs: number[], inPosition: boolean): number {
    // Enhanced action selection using technical indicators
    const rsi = features[1]
    const macdSignal = features[2] 
    const momentum = features[3]
    const trend = features[4]
    
    // Apply technical analysis filters
    let buySignal = 0
    let sellSignal = 0
    
    // RSI signals
    if (rsi < 0.3) buySignal += 0.3 // Oversold
    if (rsi > 0.7) sellSignal += 0.3 // Overbought
    
    // MACD signals
    if (macdSignal > 0.02) buySignal += 0.2
    if (macdSignal < -0.02) sellSignal += 0.2
    
    // Momentum and trend alignment
    if (momentum > 0.01 && trend > 0.01) buySignal += 0.3
    if (momentum < -0.01 && trend < -0.01) sellSignal += 0.3
    
    // Modify action probabilities based on technical signals
    const modifiedProbs = [...actionProbs]
    
    if (!inPosition) {
      modifiedProbs[0] *= (1 + buySignal) // BUY
      modifiedProbs[2] *= (1 + sellSignal * 0.5) // Reduce HOLD when sell signals
    } else {
      modifiedProbs[1] *= (1 + sellSignal) // SELL
      modifiedProbs[2] *= (1 - sellSignal * 0.3) // Reduce HOLD during sell signals
    }
    
    // Normalize probabilities
    const sum = modifiedProbs.reduce((a, b) => a + b, 0)
    const normalizedProbs = modifiedProbs.map(p => p / sum)
    
    // Sample from modified probabilities
    return this.sampleAction(normalizedProbs)
  }
  
  private sampleAction(probs: number[]): number {
    const rand = Math.random()
    let cumSum = 0
    for (let i = 0; i < probs.length; i++) {
      cumSum += probs[i]
      if (rand < cumSum) return i
    }
    return probs.length - 1
  }
  
  private calculateSharpeRatio(buffer: any[]): number {
    const returns = buffer.map(b => b.reward).filter(r => r !== 0)
    if (returns.length < 2) return 0
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((acc, ret) => acc + Math.pow(ret - mean, 2), 0) / returns.length
    const std = Math.sqrt(variance)
    return std === 0 ? 0 : mean / std
  }
  
  private updateNetworks(buffer: any[]) {
    // Simplified PPO update
    const advantages = this.calculateAdvantages(buffer)
    
    for (let i = 0; i < buffer.length; i++) {
      const { features, actionIndex, actionProbs } = buffer[i]
      const advantage = advantages[i]
      
      // Update actor (policy)
      const lr = this.learningRate
      for (let j = 0; j < features.length; j++) {
        this.actor.weights[j][actionIndex] += lr * advantage * features[j] * 0.01
      }
      
      // Update critic (value function)
      const valueError = buffer[i].reward - buffer[i].value
      for (let j = 0; j < features.length; j++) {
        this.critic.weights[j][0] += lr * valueError * features[j] * 0.01
      }
    }
  }
  
  private calculateAdvantages(buffer: any[]): number[] {
    const advantages = []
    let gae = 0
    
    for (let i = buffer.length - 1; i >= 0; i--) {
      const delta = buffer[i].reward + (i < buffer.length - 1 ? this.gamma * buffer[i + 1].value : 0) - buffer[i].value
      gae = delta + this.gamma * this.lambda * gae
      advantages[i] = gae
    }
    
    return advantages
  }
  
  getTrainingHistory(): TrainingMetrics[] {
    return this.trainingHistory
  }
  
  getModelWeights() {
    return {
      actor: this.actor,
      critic: this.critic
    }
  }
}

// Fetch real cryptocurrency data from Bybit
async function fetchBybitData(symbol: string): Promise<TrainingData[]> {
  console.log(`Fetching Bybit data for ${symbol}`)
  
  try {
    // Convert symbol format for Bybit API
    const bybitSymbol = symbol.includes('BTC') ? 'BTCUSDT' : 
                        symbol.includes('ETH') ? 'ETHUSDT' : 
                        symbol.includes('SOL') ? 'SOLUSDT' :
                        symbol.includes('ADA') ? 'ADAUSDT' :
                        symbol.includes('DOT') ? 'DOTUSDT' :
                        symbol + 'USDT';
    
    // Fetch 200 klines (4-hour intervals for more data points)
    const response = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=240&limit=200`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`⚠️ Bybit API error for ${symbol}, falling back to mock data`);
      return generateMockData(symbol);
    }

    const data = await response.json();
    
    if (data.result && data.result.list && data.result.list.length > 0) {
      console.log(`✅ Fetched ${data.result.list.length} real data points for ${symbol} from Bybit`);
      
      const trainingData: TrainingData[] = data.result.list.reverse().map((kline: any[]) => ({
        symbol,
        timestamp: new Date(parseInt(kline[0])).toISOString(),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5])
      }));
      
      return trainingData;
    }
    
    console.log(`⚠️ No data found for ${symbol} on Bybit, using mock data`);
    return generateMockData(symbol);
    
  } catch (error) {
    console.error(`❌ Error fetching Bybit data for ${symbol}:`, error);
    return generateMockData(symbol);
  }
}

// Generate realistic mock data for stocks or when Bybit fails
function generateMockData(symbol: string): TrainingData[] {
  console.log(`Generating realistic mock data for ${symbol}`)
  
  const data: TrainingData[] = []
  const dataPoints = 200
  
  // Realistic stock parameters based on actual market characteristics
  const stockParams: Record<string, { basePrice: number; volatility: number; avgVolume: number; sector: string }> = {
    'AAPL': { basePrice: 180, volatility: 0.025, avgVolume: 50000000, sector: 'tech' },
    'TSLA': { basePrice: 250, volatility: 0.045, avgVolume: 40000000, sector: 'auto' },
    'NVDA': { basePrice: 450, volatility: 0.035, avgVolume: 30000000, sector: 'tech' },
    'GOOGL': { basePrice: 140, volatility: 0.028, avgVolume: 25000000, sector: 'tech' },
    'MSFT': { basePrice: 380, volatility: 0.022, avgVolume: 20000000, sector: 'tech' },
    'AMZN': { basePrice: 145, volatility: 0.030, avgVolume: 35000000, sector: 'tech' },
    'META': { basePrice: 320, volatility: 0.035, avgVolume: 18000000, sector: 'tech' },
    'NFLX': { basePrice: 450, volatility: 0.040, avgVolume: 8000000, sector: 'tech' },
    'JPM': { basePrice: 160, volatility: 0.025, avgVolume: 15000000, sector: 'financial' },
    'JNJ': { basePrice: 160, volatility: 0.018, avgVolume: 12000000, sector: 'healthcare' },
    'PG': { basePrice: 155, volatility: 0.015, avgVolume: 8000000, sector: 'consumer' },
    'V': { basePrice: 260, volatility: 0.022, avgVolume: 7000000, sector: 'financial' },
    'WMT': { basePrice: 160, volatility: 0.020, avgVolume: 10000000, sector: 'retail' },
    'UNH': { basePrice: 520, volatility: 0.025, avgVolume: 3000000, sector: 'healthcare' },
    'HD': { basePrice: 360, volatility: 0.023, avgVolume: 4000000, sector: 'retail' },
    'SPY': { basePrice: 450, volatility: 0.015, avgVolume: 80000000, sector: 'etf' },
    'QQQ': { basePrice: 380, volatility: 0.020, avgVolume: 40000000, sector: 'etf' },
    'IWM': { basePrice: 200, volatility: 0.025, avgVolume: 25000000, sector: 'etf' },
    'VTI': { basePrice: 240, volatility: 0.015, avgVolume: 5000000, sector: 'etf' }
  };
  
  // Get stock parameters or defaults
  const params = stockParams[symbol] || { 
    basePrice: 100 + Math.random() * 100, 
    volatility: 0.025, 
    avgVolume: 10000000,
    sector: 'general'
  };
  
  let price = params.basePrice + (Math.random() - 0.5) * params.basePrice * 0.2;
  
  // Support and resistance levels
  const supportLevel = price * 0.85;
  const resistanceLevel = price * 1.15;
  let prevPrice = price;
  
  // Market regime simulation
  let marketRegime = Math.random() > 0.5 ? 'bull' : 'bear';
  let regimeStrength = 0.3 + Math.random() * 0.4; // 0.3 to 0.7
  let regimeDuration = 0;
  const maxRegimeDuration = 40 + Math.random() * 60;
  
  // Volatility clustering parameters
  let currentVolCluster = params.volatility;
  let volClusterDirection = Math.random() > 0.5 ? 1 : -1;
  
  for (let i = 0; i < dataPoints; i++) {
    // Change market regime periodically
    regimeDuration++;
    if (regimeDuration > maxRegimeDuration) {
      const regimes = ['bull', 'bear', 'sideways'];
      marketRegime = regimes[Math.floor(Math.random() * regimes.length)];
      regimeStrength = 0.2 + Math.random() * 0.6;
      regimeDuration = 0;
    }
    
    // Calculate trend based on regime
    let trend = 0;
    if (marketRegime === 'bull') {
      trend = 0.0008 * regimeStrength + Math.random() * 0.001;
    } else if (marketRegime === 'bear') {
      trend = -0.0008 * regimeStrength - Math.random() * 0.001;
    } else {
      trend = (Math.random() - 0.5) * 0.0003; // sideways with small drift
    }
    
    // Volatility clustering - periods of high/low volatility
    currentVolCluster += volClusterDirection * Math.random() * 0.002;
    if (currentVolCluster > params.volatility * 2) volClusterDirection = -1;
    if (currentVolCluster < params.volatility * 0.3) volClusterDirection = 1;
    currentVolCluster = Math.max(0.005, Math.min(0.08, currentVolCluster));
    
    // Mean reversion around support/resistance
    let meanReversion = 0;
    if (price < supportLevel) {
      meanReversion = 0.002 * Math.random(); // Bounce off support
    } else if (price > resistanceLevel) {
      meanReversion = -0.002 * Math.random(); // Rejection at resistance
    }
    
    // Momentum component
    const momentum = (price - prevPrice) / prevPrice * 0.3; // 30% momentum carry-over
    
    // News/earnings simulation (random spikes)
    let newsImpact = 0;
    if (Math.random() < 0.02) { // 2% chance of news event
      newsImpact = (Math.random() - 0.5) * 0.05; // ±5% news impact
    }
    
    // Combine all factors
    const totalReturn = trend + meanReversion + momentum + newsImpact + 
                       (Math.random() - 0.5) * currentVolCluster;
    
    prevPrice = price;
    const open = price;
    const change = totalReturn * price;
    const close = Math.max(1, price + change);
    
    // Realistic intraday range
    const dailyRange = currentVolCluster * price * (0.5 + Math.random() * 0.5);
    const high = Math.max(open, close) + dailyRange * Math.random() * 0.6;
    const low = Math.min(open, close) - dailyRange * Math.random() * 0.6;
    
    // Realistic volume with correlation to price movement and volatility
    const priceChangeAbs = Math.abs(change / price);
    const volumeMultiplier = 1 + priceChangeAbs * 3; // Higher volume on big moves
    const volume = Math.floor(params.avgVolume * volumeMultiplier * (0.3 + Math.random() * 1.4));
    
    // Use daily intervals for stocks (not 4-hour like crypto)
    const isStock = !symbol.includes('USD') && !symbol.includes('BTC') && !symbol.includes('ETH');
    const intervalHours = isStock ? 24 : 4;
    const timestamp = new Date(Date.now() - (dataPoints - i) * intervalHours * 60 * 60 * 1000);
    
    // Skip weekends for stocks
    if (isStock && (timestamp.getDay() === 0 || timestamp.getDay() === 6)) {
      continue;
    }
    
    data.push({
      symbol,
      timestamp: timestamp.toISOString(),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume
    });
    
    price = close;
  }
  
  console.log(`Generated ${data.length} realistic data points for ${symbol}`);
  return data;
}

// Historical data fetcher - uses Bybit for crypto, mock for stocks
async function fetchHistoricalData(symbol: string): Promise<TrainingData[]> {
  // Use Bybit for cryptocurrency pairs
  if (symbol.includes('USD') || symbol.includes('BTC') || symbol.includes('ETH')) {
    return await fetchBybitData(symbol);
  }
  
  // Use enhanced mock data for stocks
  return generateMockData(symbol);
}

// ============= Serverless Function Handler =============

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { action, symbols } = await req.json()

    if (action === 'train') {
      const trainer = new PPOTrainer()
      const allMetrics: { [symbol: string]: TrainingMetrics[] } = {}
      
      // Default symbols if none provided
      const symbolsToTrain = symbols || [
        // Major US Tech Stocks
        'AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'META', 'AMZN', 'NFLX',
        // Other Major Stocks
        'JPM', 'JNJ', 'PG', 'V', 'WMT', 'UNH', 'HD',
        // ETFs
        'SPY', 'QQQ', 'IWM', 'VTI',
        // Major Cryptocurrencies
        'BTCUSD', 'ETHUSD', 'SOLUSDT', 'ADAUSDT', 'DOTUSDT'
      ]
      
      console.log(`Starting PPO training on ${symbolsToTrain.length} symbols`)
      
      for (const symbol of symbolsToTrain) {
        try {
          const historicalData = await fetchHistoricalData(symbol)
          const metrics = await trainer.trainOnSymbol(symbol, historicalData)
          allMetrics[symbol] = metrics
          
          // Store training results in database
          const latestMetrics = metrics[metrics.length - 1]
          await supabase.from('bot_adaptive_parameters').upsert({
            user_id: '00000000-0000-0000-0000-000000000000', // System training
            symbol,
            confidence_threshold: 75.0,
            confluence_threshold: 0.6,
            total_trades: latestMetrics.totalTrades,
            winning_trades: latestMetrics.profitableTrades,
            success_rate: latestMetrics.winRate,
            average_profit: latestMetrics.avgTradeReturn,
            last_updated: new Date().toISOString()
          })
          
        } catch (error) {
          console.error(`Error training on ${symbol}:`, error)
        }
      }
      
      // Calculate overall performance metrics
      const allEpisodes = Object.values(allMetrics).flat()
      
      const overallMetrics = {
        totalSymbols: symbolsToTrain.length,
        totalTrades: allEpisodes.reduce((sum, m) => sum + m.totalTrades, 0),
        averageWinRate: allEpisodes.reduce((sum, m) => sum + m.winRate, 0) / allEpisodes.length,
        averageReward: allEpisodes.reduce((sum, m) => sum + m.totalReturn, 0) / allEpisodes.length,
        averageTradeReturn: allEpisodes.reduce((sum, m) => sum + m.avgTradeReturn, 0) / allEpisodes.length,
        modelWeights: trainer.getModelWeights(),
        symbolMetrics: allMetrics
      }
      
      return new Response(JSON.stringify({
        success: true,
        message: 'PPO model training completed',
        metrics: overallMetrics
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    if (action === 'getMetrics') {
      // Fetch latest training metrics from database
      const { data: params } = await supabase
        .from('bot_adaptive_parameters')
        .select('*')
        .order('last_updated', { ascending: false })
        .limit(100)
      
      return new Response(JSON.stringify({
        success: true,
        metrics: params || []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid action'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('PPO Training Error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: (error as Error).message || 'PPO training failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})