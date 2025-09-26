import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TrainingData {
  symbol: string
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface PPOState {
  symbol: string
  indicators: any
  marketRegime: string
  volatility: number
  momentum: number
  trend: number
}

interface PPOAction {
  action: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  stopLoss: number
  targets: number[]
  positionSize: number
}

interface TrainingMetrics {
  episode: number
  totalReward: number
  averageReward: number
  winRate: number
  sharpeRatio: number
  maxDrawdown: number
  totalTrades: number
  profitableTrades: number
  loss: number
  policyLoss: number
  valueLoss: number
}

class PPOTrainer {
  private learningRate = 0.0003
  private clipEpsilon = 0.2
  private gamma = 0.99
  private lambda = 0.95
  private entropyCoeff = 0.01
  private valueCoeff = 0.5
  private maxGradNorm = 0.5
  
  private actor: any = null
  private critic: any = null
  private optimizer: any = null
  
  private trainingHistory: TrainingMetrics[] = []
  private replayBuffer: any[] = []
  
  constructor() {
    this.initializeNetworks()
  }
  
  private initializeNetworks() {
    // Initialize simple neural network approximations
    // In a real implementation, this would use TensorFlow.js or similar
    this.actor = {
      weights: this.randomWeights(50, 3), // 50 input features -> 3 actions
      bias: this.randomWeights(1, 3)
    }
    
    this.critic = {
      weights: this.randomWeights(50, 1), // 50 input features -> 1 value
      bias: this.randomWeights(1, 1)
    }
  }
  
  private randomWeights(inputSize: number, outputSize: number): number[][] {
    const weights: number[][] = []
    for (let i = 0; i < inputSize; i++) {
      weights[i] = []
      for (let j = 0; j < outputSize; j++) {
        weights[i][j] = (Math.random() - 0.5) * 0.2
      }
    }
    return weights
  }
  
  private extractFeatures(data: TrainingData[], index: number): number[] {
    const features = []
    const current = data[index]
    
    // Price features
    features.push(current.close / current.open - 1) // Price change
    features.push(current.volume / 1000000) // Normalized volume
    features.push((current.high - current.low) / current.close) // Volatility
    
    // Technical indicators (simplified)
    const prices = data.slice(Math.max(0, index - 20), index + 1).map(d => d.close)
    const sma20 = prices.reduce((a, b) => a + b, 0) / prices.length
    const sma50 = data.slice(Math.max(0, index - 50), index + 1).map(d => d.close).reduce((a, b) => a + b, 0) / Math.min(50, index + 1)
    
    features.push(current.close / sma20 - 1) // Distance from SMA20
    features.push(current.close / sma50 - 1) // Distance from SMA50
    features.push(sma20 / sma50 - 1) // SMA trend
    
    // RSI approximation
    const gains = []
    const losses = []
    for (let i = Math.max(1, index - 14); i <= index; i++) {
      const change = data[i].close - data[i - 1].close
      gains.push(Math.max(change, 0))
      losses.push(Math.max(-change, 0))
    }
    const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length
    const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length
    const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))
    features.push(rsi / 100) // Normalized RSI
    
    // Market regime features
    const volatility = this.calculateVolatility(data, index)
    const momentum = this.calculateMomentum(data, index)
    const trend = this.calculateTrend(data, index)
    
    features.push(volatility)
    features.push(momentum)
    features.push(trend)
    
    // Pad or truncate to 50 features
    while (features.length < 50) {
      features.push(0)
    }
    
    return features.slice(0, 50)
  }
  
  private calculateVolatility(data: TrainingData[], index: number): number {
    const returns = []
    for (let i = Math.max(1, index - 20); i <= index; i++) {
      returns.push(Math.log(data[i].close / data[i - 1].close))
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((acc, ret) => acc + Math.pow(ret - mean, 2), 0) / returns.length
    return Math.sqrt(variance) * Math.sqrt(252) // Annualized volatility
  }
  
  private calculateMomentum(data: TrainingData[], index: number): number {
    if (index < 20) return 0
    return (data[index].close - data[index - 20].close) / data[index - 20].close
  }
  
  private calculateTrend(data: TrainingData[], index: number): number {
    const prices = data.slice(Math.max(0, index - 50), index + 1).map(d => d.close)
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
  
  private calculateReward(action: PPOAction, data: TrainingData[], index: number): number {
    if (index >= data.length - 1) return 0
    
    const currentPrice = data[index].close
    const futurePrice = data[index + 1].close
    const priceChange = (futurePrice - currentPrice) / currentPrice
    
    let reward = 0
    
    if (action.action === 'BUY' && priceChange > 0) {
      reward = priceChange * action.confidence * action.positionSize
    } else if (action.action === 'SELL' && priceChange < 0) {
      reward = -priceChange * action.confidence * action.positionSize
    } else if (action.action === 'HOLD') {
      reward = -Math.abs(priceChange) * 0.1 // Small penalty for missing moves
    } else {
      reward = priceChange * action.confidence * action.positionSize // Penalty for wrong direction
    }
    
    // Bonus for high confidence correct predictions
    if ((action.action === 'BUY' && priceChange > 0.01) || 
        (action.action === 'SELL' && priceChange < -0.01)) {
      reward += action.confidence * 0.1
    }
    
    return reward
  }
  
  async trainOnSymbol(symbol: string, data: TrainingData[]): Promise<TrainingMetrics[]> {
    console.log(`Training PPO model on ${symbol} with ${data.length} data points`)
    
    const episodeMetrics: TrainingMetrics[] = []
    const episodes = 10 // Number of training episodes
    
    for (let episode = 0; episode < episodes; episode++) {
      let totalReward = 0
      let trades = 0
      let profitableTrades = 0
      let maxDrawdown = 0
      let currentDrawdown = 0
      let peak = 0
      
      const episodeBuffer: any[] = []
      
      // Run episode
      for (let i = 50; i < data.length - 1; i++) {
        const features = this.extractFeatures(data, i)
        const actionProbs = this.forwardActor(features)
        const value = this.forwardCritic(features)
        
        // Sample action
        const actionIndex = this.sampleAction(actionProbs)
        const action: PPOAction = {
          action: ['BUY', 'SELL', 'HOLD'][actionIndex] as any,
          confidence: actionProbs[actionIndex],
          stopLoss: data[i].close * (actionIndex === 0 ? 0.98 : 1.02),
          targets: [data[i].close * (actionIndex === 0 ? 1.05 : 0.95)],
          positionSize: actionProbs[actionIndex]
        }
        
        const reward = this.calculateReward(action, data, i)
        totalReward += reward
        
        if (action.action !== 'HOLD') {
          trades++
          if (reward > 0) profitableTrades++
        }
        
        // Track drawdown
        if (totalReward > peak) peak = totalReward
        currentDrawdown = peak - totalReward
        if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown
        
        episodeBuffer.push({
          features,
          actionIndex,
          actionProbs,
          value,
          reward,
          done: i === data.length - 2
        })
      }
      
      // Calculate advantages and update networks
      this.updateNetworks(episodeBuffer)
      
      const metrics: TrainingMetrics = {
        episode: episode + 1,
        totalReward,
        averageReward: totalReward / (data.length - 51),
        winRate: trades > 0 ? profitableTrades / trades : 0,
        sharpeRatio: this.calculateSharpeRatio(episodeBuffer),
        maxDrawdown,
        totalTrades: trades,
        profitableTrades,
        loss: 0, // Would be calculated during network update
        policyLoss: 0,
        valueLoss: 0
      }
      
      episodeMetrics.push(metrics)
      this.trainingHistory.push(metrics)
      
      console.log(`Episode ${episode + 1}/${episodes} - Reward: ${totalReward.toFixed(4)}, Win Rate: ${(metrics.winRate * 100).toFixed(2)}%`)
    }
    
    return episodeMetrics
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
    const returns = buffer.map(b => b.reward)
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((acc, ret) => acc + Math.pow(ret - mean, 2), 0) / returns.length
    const std = Math.sqrt(variance)
    return std === 0 ? 0 : mean / std
  }
  
  private updateNetworks(buffer: any[]) {
    // Simplified PPO update
    // In a real implementation, this would use proper gradient computation
    
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

// Historical data fetcher
async function fetchHistoricalData(symbol: string): Promise<TrainingData[]> {
  console.log(`Fetching 2 years of data for ${symbol}`)
  
  // Simulate fetching historical data
  // In production, this would call a real API like Alpha Vantage, Yahoo Finance, etc.
  const data: TrainingData[] = []
  const startDate = new Date('2022-01-01')
  const endDate = new Date('2024-01-01')
  
  let currentDate = new Date(startDate)
  let price = 100 + Math.random() * 50 // Starting price
  
  while (currentDate <= endDate) {
    // Skip weekends for stocks
    if (symbol.includes('USD') || currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
      const volatility = 0.02 + Math.random() * 0.03
      const drift = (Math.random() - 0.5) * 0.002
      
      const open = price
      const change = (drift + (Math.random() - 0.5) * volatility) * price
      const close = Math.max(1, price + change)
      
      const high = Math.max(open, close) * (1 + Math.random() * 0.02)
      const low = Math.min(open, close) * (1 - Math.random() * 0.02)
      const volume = Math.floor(1000000 + Math.random() * 5000000)
      
      data.push({
        symbol,
        date: currentDate.toISOString().split('T')[0],
        open,
        high,
        low,
        close,
        volume
      })
      
      price = close
    }
    
    currentDate.setDate(currentDate.getDate() + 1)
  }
  
  return data
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, symbols } = await req.json()

    if (action === 'train') {
      const trainer = new PPOTrainer()
      const allMetrics: { [symbol: string]: TrainingMetrics[] } = {}
      
      // Default symbols if none provided
      const symbolsToTrain = symbols || [
        'AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', // Tech stocks
        'SPY', 'QQQ', 'IWM', // ETFs
        'BTCUSD', 'ETHUSD', 'ADAUSD' // Crypto
      ]
      
      console.log(`Starting PPO training on ${symbolsToTrain.length} symbols`)
      
      for (const symbol of symbolsToTrain) {
        try {
          const historicalData = await fetchHistoricalData(symbol)
          const metrics = await trainer.trainOnSymbol(symbol, historicalData)
          allMetrics[symbol] = metrics
          
          // Store training results in database
          await supabase.from('bot_adaptive_parameters').upsert({
            user_id: '00000000-0000-0000-0000-000000000000', // System training
            symbol,
            confidence_threshold: 75.0,
            confluence_threshold: 0.6,
            total_trades: metrics[metrics.length - 1].totalTrades,
            winning_trades: metrics[metrics.length - 1].profitableTrades,
            success_rate: metrics[metrics.length - 1].winRate,
            average_profit: metrics[metrics.length - 1].averageReward,
            last_updated: new Date().toISOString()
          })
          
        } catch (error) {
          console.error(`Error training on ${symbol}:`, error)
        }
      }
      
      const overallMetrics = {
        totalSymbols: symbolsToTrain.length,
        averageWinRate: Object.values(allMetrics).flat().reduce((acc, m) => acc + m.winRate, 0) / Object.values(allMetrics).flat().length,
        averageReward: Object.values(allMetrics).flat().reduce((acc, m) => acc + m.averageReward, 0) / Object.values(allMetrics).flat().length,
        totalTrades: Object.values(allMetrics).flat().reduce((acc, m) => acc + m.totalTrades, 0),
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
    console.error('Error in train-ppo-model function:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})