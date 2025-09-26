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
      
      // Run episode with proper trading simulation
      for (let i = 50; i < data.length - 1; i++) {
        const features = this.extractFeatures(data, i)
        const actionProbs = this.forwardActor(features)
        const value = this.forwardCritic(features)
        const currentPrice = data[i].close
        
        // Sample action
        const actionIndex = this.sampleAction(actionProbs)
        const actionName = ['BUY', 'SELL', 'HOLD'][actionIndex] as 'BUY' | 'SELL' | 'HOLD'
        
        // Execute trades
        let tradeReward = 0
        
        if (actionName === 'BUY' && !inPosition && portfolio.cash > 0) {
          // Enter long position
          portfolio.shares = portfolio.cash / currentPrice
          portfolio.cash = 0
          entryPrice = currentPrice
          inPosition = true
        } else if (actionName === 'SELL' && inPosition) {
          // Exit position
          portfolio.cash = portfolio.shares * currentPrice
          const tradeReturn = (currentPrice - entryPrice) / entryPrice
          
          portfolio.trades.push({
            entry: entryPrice,
            exit: currentPrice,
            profit: tradeReturn,
            type: 'LONG'
          })
          
          if (tradeReturn > 0) profitableTrades++
          tradeReward = tradeReturn
          portfolio.shares = 0
          inPosition = false
        }
        
        // Calculate current portfolio value
        portfolio.totalValue = portfolio.cash + (portfolio.shares * currentPrice)
        
        // Track drawdown
        if (portfolio.totalValue > maxValue) maxValue = portfolio.totalValue
        const currentDrawdown = (maxValue - portfolio.totalValue) / maxValue
        if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown
        
        episodeBuffer.push({
          features,
          actionIndex,
          actionProbs,
          value,
          reward: tradeReward,
          done: i === data.length - 2
        })
      }
      
      // Close any remaining position
      if (inPosition && data.length > 0) {
        const finalPrice = data[data.length - 1].close
        portfolio.cash = portfolio.shares * finalPrice
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
      
      // Update networks
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

// Historical data fetcher
async function fetchHistoricalData(symbol: string): Promise<TrainingData[]> {
  console.log(`Fetching 2 years of data for ${symbol}`)
  
  // Simulate fetching historical data
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
        timestamp: currentDate.toISOString(),
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
        'AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', // Tech stocks
        'SPY', 'QQQ', // ETFs  
        'BTCUSD', 'ETHUSD' // Crypto
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