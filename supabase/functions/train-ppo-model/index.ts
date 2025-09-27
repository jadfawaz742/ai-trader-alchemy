import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Interface for training data
interface TrainingData {
  timestamp: number
  price: number
  volume: number
  open: number
  high: number
  low: number
  close: number
}

// Interface for training metrics
interface TrainingMetrics {
  symbol: string
  winRate: number
  avgReturn: number
  totalTrades: number
  sharpeRatio?: number
  trainingDuration: number
}

// Interface for PPO state and action
interface PPOState {
  features: number[]
  reward: number
  done: boolean
}

interface PPOAction {
  actionIndex: number
  actionProbs: number[]
  value: number
}

// Asset-specific PPO Trainer class implementing Proximal Policy Optimization
class AssetSpecificPPOTrainer {
  private actor!: { weights: number[][], bias: number[][] }
  private critic!: { weights: number[][], bias: number[][] }
  private trainingHistory: TrainingMetrics[] = []
  private assetType: string
  private assetCharacteristics: any
  private learningRate = 0.001
  private gamma = 0.99
  private lambda = 0.95

  constructor(assetType: string = 'GENERAL', baseModel?: any) {
    this.assetType = assetType
    this.assetCharacteristics = this.getAssetCharacteristics(assetType)
    
    if (baseModel) {
      // Fine-tune from base model
      this.actor = JSON.parse(JSON.stringify(baseModel.actor))
      this.critic = JSON.parse(JSON.stringify(baseModel.critic))
      // Adjust learning rate for fine-tuning
      this.learningRate = 0.0005
    } else {
      this.initializeNetworks()
    }
  }

  private getAssetCharacteristics(assetType: string) {
    const crypto = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT']
    const stocks = ['AAPL', 'GOOGL', 'MSFT', 'NVDA', 'TSLA', 'META', 'NFLX', 'AMD', 'CRM', 'UBER']
    const etfs = ['SPY', 'QQQ', 'VTI', 'GLD']
    
    if (crypto.some(c => assetType.includes(c))) {
      return {
        volatility: 'high',
        liquidity: 'high',
        correlation: 'crypto',
        tradingHours: '24/7',
        sensitivity: 'high'
      }
    } else if (stocks.some(s => assetType.includes(s))) {
      return {
        volatility: 'medium',
        liquidity: 'high',
        correlation: 'equity',
        tradingHours: 'market',
        sensitivity: 'medium'
      }
    } else if (etfs.some(e => assetType.includes(e))) {
      return {
        volatility: 'low',
        liquidity: 'high',
        correlation: 'market', 
        tradingHours: 'market',
        sensitivity: 'low'
      }
    }
    
    return {
      volatility: 'medium',
      liquidity: 'medium',
      correlation: 'general',
      tradingHours: 'market',
      sensitivity: 'medium'
    }
  }

  private initializeNetworks() {
    const inputSize = 15 // Number of features including asset-specific ones
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
      Array.from({ length: cols }, () => (Math.random() - 0.5) * 0.2)
    )
  }

  extractFeatures(data: TrainingData[], index: number): number[] {
    const current = data[index]
    const prev = index > 0 ? data[index - 1] : current
    const prev5 = index >= 5 ? data[index - 5] : current
    const prev20 = index >= 20 ? data[index - 20] : current
    
    const baseFeatures = [
      current.price / 100,                    // Normalized price
      current.volume / 1000000,               // Normalized volume
      (current.price - prev.price) / prev.price, // Price change
      (current.price - prev5.price) / prev5.price, // 5-period momentum
      (current.price - prev20.price) / prev20.price, // 20-period momentum
      current.price > this.calculateSMA(data, index, 10) ? 1 : 0, // Above SMA10
      current.price > this.calculateSMA(data, index, 20) ? 1 : 0, // Above SMA20
      this.calculateRSI(data, index),         // RSI
      this.calculateMACD(data, index),        // MACD
      this.calculateVolatility(data, index),  // Volatility
      this.calculateATR(data, index),         // ATR
      this.calculateOBV(data, index),         // OBV
      this.calculateBollingerPosition(data, index) // Bollinger position
    ]
    
    // Add asset-specific features
    const assetFeatures = this.getAssetSpecificFeatures(data, index)
    
    return [...baseFeatures, ...assetFeatures]
  }
  
  private getAssetSpecificFeatures(data: TrainingData[], index: number): number[] {
    const { volatility, sensitivity } = this.assetCharacteristics
    const current = data[index]
    
    // Asset-specific feature adjustments
    const volatilityMultiplier = volatility === 'high' ? 1.5 : volatility === 'low' ? 0.5 : 1.0
    const sensitivityScore = sensitivity === 'high' ? 0.8 : sensitivity === 'low' ? 0.2 : 0.5
    
    return [
      volatilityMultiplier * this.calculateVolatility(data, index), // Adjusted volatility
      sensitivityScore // Asset sensitivity score
    ]
  }

  private calculateSMA(data: TrainingData[], index: number, period: number): number {
    const start = Math.max(0, index - period + 1)
    const prices = data.slice(start, index + 1).map(d => d.price)
    return prices.reduce((sum, price) => sum + price, 0) / prices.length
  }

  private calculateRSI(data: TrainingData[], index: number, period = 14): number {
    if (index < period) return 50 // Neutral RSI for insufficient data
    
    let gains = 0, losses = 0
    for (let i = index - period + 1; i <= index; i++) {
      const change = data[i].price - data[i - 1].price
      if (change > 0) gains += change
      else losses -= change
    }
    
    const avgGain = gains / period
    const avgLoss = losses / period
    if (avgLoss === 0) return 100
    
    const rs = avgGain / avgLoss
    return 100 - (100 / (1 + rs))
  }

  private calculateMACD(data: TrainingData[], index: number): number {
    const ema12 = this.calculateEMA(data, index, 12)
    const ema26 = this.calculateEMA(data, index, 26)
    return (ema12 - ema26) / ema26 // Normalized MACD
  }

  private calculateEMA(data: TrainingData[], index: number, period: number): number {
    if (index < period - 1) return data[index].price
    
    const multiplier = 2 / (period + 1)
    let ema = data[Math.max(0, index - period + 1)].price
    
    for (let i = Math.max(1, index - period + 2); i <= index; i++) {
      ema = (data[i].price - ema) * multiplier + ema
    }
    
    return ema
  }

  private calculateVolatility(data: TrainingData[], index: number, period = 20): number {
    if (index < period) return 0.1
    
    const prices = data.slice(index - period + 1, index + 1).map(d => d.price)
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length
    return Math.sqrt(variance) / mean // Normalized volatility
  }

  private calculateATR(data: TrainingData[], index: number, period = 14): number {
    if (index < 1) return 0.01
    
    const current = data[index]
    const previous = data[index - 1]
    
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    )
    
    // Simple ATR approximation
    return tr / current.price // Normalized ATR
  }

  private calculateOBV(data: TrainingData[], index: number): number {
    if (index < 1) return 0
    
    let obv = 0
    for (let i = 1; i <= index; i++) {
      if (data[i].price > data[i - 1].price) {
        obv += data[i].volume
      } else if (data[i].price < data[i - 1].price) {
        obv -= data[i].volume
      }
    }
    
    return obv / 1000000 // Normalized OBV
  }

  private calculateBollingerPosition(data: TrainingData[], index: number, period = 20): number {
    if (index < period) return 0.5
    
    const sma = this.calculateSMA(data, index, period)
    const std = this.calculateStandardDeviation(data, index, period)
    
    const upperBand = sma + (2 * std)
    const lowerBand = sma - (2 * std)
    
    // Position within Bollinger Bands (0 = lower band, 1 = upper band)
    return (data[index].price - lowerBand) / (upperBand - lowerBand)
  }

  private calculateStandardDeviation(data: TrainingData[], index: number, period: number): number {
    const sma = this.calculateSMA(data, index, period)
    const start = Math.max(0, index - period + 1)
    const prices = data.slice(start, index + 1).map(d => d.price)
    
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / prices.length
    return Math.sqrt(variance)
  }

  async trainOnSymbol(symbol: string, data: TrainingData[]): Promise<TrainingMetrics> {
    console.log(`🎯 Training asset-specific PPO model for ${symbol} (${this.assetType})...`)
    const startTime = Date.now()
    
    let totalReward = 0
    let totalTrades = 0
    let winningTrades = 0
    const buffer: any[] = []
    
    // Simulate trading episodes with asset-specific behavior
    const episodes = 5
    for (let episode = 0; episode < episodes; episode++) {
      let position = 0 // -1: short, 0: neutral, 1: long
      let balance = 10000
      let shares = 0
      
      for (let i = 20; i < data.length - 1; i++) {
        const features = this.extractFeatures(data, i)
        const action = this.selectSmartAction(features, data, i, position > 0)
        const nextPrice = data[i + 1].price
        const currentPrice = data[i].price
        
        let reward = 0
        let traded = false
        
        // Execute trading action with asset-specific considerations
        if (action === 0 && position <= 0) { // BUY
          const tradeSize = Math.floor(balance * 0.95 / currentPrice)
          if (tradeSize > 0) {
            shares += tradeSize
            balance -= tradeSize * currentPrice
            position = 1
            traded = true
            totalTrades++
          }
        } else if (action === 1 && position >= 0) { // SELL
          if (shares > 0) {
            const saleValue = shares * currentPrice
            balance += saleValue
            
            // Calculate reward based on performance
            const returnRate = (currentPrice - (balance + saleValue - 10000) / shares) / currentPrice
            reward = returnRate * 100 // Scale reward
            
            if (reward > 0) winningTrades++
            
            shares = 0
            position = -1
            traded = true
            totalTrades++
          }
        }
        
        // Enhanced reward function for asset-specific training
        if (traded) {
          // Asset-specific reward adjustments
          const volatilityBonus = this.assetCharacteristics.volatility === 'high' ? 1.2 : 1.0
          const liquidityBonus = this.assetCharacteristics.liquidity === 'high' ? 1.1 : 1.0
          reward *= volatilityBonus * liquidityBonus
          
          totalReward += reward
        }
        
        // Store experience for PPO update
        const value = this.forward(this.critic, features)[0]
        const actionProbs = this.forward(this.actor, features)
        
        buffer.push({
          features,
          actionIndex: action,
          actionProbs: [...actionProbs],
          reward,
          value,
          traded
        })
      }
      
      // Update networks every episode
      if (buffer.length > 0) {
        this.updateNetworks(buffer.filter(b => b.traded))
      }
    }
    
    const avgReturn = totalTrades > 0 ? totalReward / totalTrades : 0
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0
    const trainingDuration = Date.now() - startTime
    
    const metrics: TrainingMetrics = {
      symbol,
      winRate,
      avgReturn: avgReturn / 100, // Convert back to percentage
      totalTrades,
      sharpeRatio: this.calculateSharpeRatio(buffer),
      trainingDuration
    }
    
    this.trainingHistory.push(metrics)
    
    console.log(`✅ ${symbol} training complete: ${(winRate * 100).toFixed(1)}% win rate, ${totalTrades} trades`)
    
    return metrics
  }

  private forward(network: { weights: number[][], bias: number[][] }, input: number[]): number[] {
    const result = network.weights.map((weights, i) => {
      const sum = weights.reduce((acc, weight, j) => acc + weight * input[j], 0) + network.bias[0][i]
      return Math.tanh(sum) // Activation function
    })
    
    // Softmax for actor, linear for critic
    if (network === this.actor) {
      const max = Math.max(...result)
      const exp = result.map(x => Math.exp(x - max))
      const sum = exp.reduce((a, b) => a + b, 0)
      return exp.map(x => x / sum)
    }
    
    return result
  }

  private selectSmartAction(features: number[], data: TrainingData[], index: number, inPosition: boolean): number {
    const actionProbs = this.forward(this.actor, features)
    
    // Enhanced action selection with technical indicators and asset-specific logic
    const rsi = features[7] * 100 // RSI feature
    const macd = features[8] // MACD feature
    const volatility = features[9] // Volatility feature
    
    // Asset-specific signal strength adjustments
    const { sensitivity, volatility: assetVolatility } = this.assetCharacteristics
    const sensitivityMultiplier = sensitivity === 'high' ? 1.3 : sensitivity === 'low' ? 0.7 : 1.0
    const volatilityThreshold = assetVolatility === 'high' ? 0.8 : assetVolatility === 'low' ? 0.3 : 0.5
    
    // Calculate technical signals
    const buySignal = (rsi < 30 ? 0.3 : 0) + (macd > 0 ? 0.2 : 0) + (volatility > volatilityThreshold ? 0.1 : 0)
    const sellSignal = (rsi > 70 ? 0.3 : 0) + (macd < 0 ? 0.2 : 0) + (volatility > volatilityThreshold ? 0.1 : 0)
    
    // Apply asset-specific adjustments
    const adjustedBuySignal = buySignal * sensitivityMultiplier
    const adjustedSellSignal = sellSignal * sensitivityMultiplier
    
    // Modify action probabilities based on technical analysis
    const modifiedProbs = [...actionProbs]
    
    if (!inPosition) {
      modifiedProbs[0] *= (1 + adjustedBuySignal) // BUY
      modifiedProbs[2] *= (1 + adjustedSellSignal * 0.5) // Reduce HOLD when sell signals
    } else {
      modifiedProbs[1] *= (1 + adjustedSellSignal) // SELL
      modifiedProbs[2] *= (1 - adjustedSellSignal * 0.3) // Reduce HOLD during sell signals
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
    // Simplified PPO update with asset-specific considerations
    const advantages = this.calculateAdvantages(buffer)
    
    for (let i = 0; i < buffer.length; i++) {
      const { features, actionIndex, actionProbs } = buffer[i]
      const advantage = advantages[i]
      
      // Asset-specific learning rate adjustment
      const assetLearningRate = this.learningRate * (this.assetCharacteristics.sensitivity === 'high' ? 1.2 : 1.0)
      
      // Update actor (policy)
      for (let j = 0; j < features.length; j++) {
        this.actor.weights[j][actionIndex] += assetLearningRate * advantage * features[j] * 0.01
      }
      
      // Update critic (value function)
      const valueError = buffer[i].reward - buffer[i].value
      for (let j = 0; j < features.length; j++) {
        this.critic.weights[j][0] += assetLearningRate * valueError * features[j] * 0.01
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
      critic: this.critic,
      assetType: this.assetType,
      assetCharacteristics: this.assetCharacteristics,
      trainingHistory: this.trainingHistory
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
      }
    });

    if (!response.ok) {
      throw new Error(`Bybit API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.retCode !== 0 || !data.result?.list) {
      throw new Error(`Bybit API error: ${data.retMsg || 'No data'}`);
    }

    console.log(`✅ Successfully fetched ${data.result.list.length} data points for ${symbol} from Bybit`);
    
    // Convert Bybit data format to our TrainingData interface
    // Bybit returns: [startTime, openPrice, highPrice, lowPrice, closePrice, volume, turnover]
    return data.result.list.map((item: any[]) => ({
      timestamp: parseInt(item[0]),
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      price: parseFloat(item[4]), // Use close price as main price
      volume: parseFloat(item[5])
    })).reverse(); // Bybit returns newest first, we want oldest first
    
  } catch (error) {
    console.error(`❌ Failed to fetch Bybit data for ${symbol}:`, error);
    return [];
  }
}

// Generate realistic mock data for stocks and fallback
function generateMockData(symbol: string): TrainingData[] {
  console.log(`Generating realistic mock data for ${symbol}`)
  
  // Asset-specific parameters for realistic simulation
  const assetParams = {
    'AAPL': { basePrice: 150, volatility: 0.02, trend: 0.0001 },
    'GOOGL': { basePrice: 2500, volatility: 0.025, trend: 0.0002 },
    'MSFT': { basePrice: 300, volatility: 0.018, trend: 0.0001 },
    'NVDA': { basePrice: 500, volatility: 0.04, trend: 0.0003 },
    'TSLA': { basePrice: 800, volatility: 0.05, trend: 0.0001 },
    'META': { basePrice: 350, volatility: 0.03, trend: 0.0001 },
    'NFLX': { basePrice: 450, volatility: 0.035, trend: 0.0001 },
    'AMD': { basePrice: 120, volatility: 0.04, trend: 0.0002 },
    'CRM': { basePrice: 200, volatility: 0.03, trend: 0.0001 },
    'UBER': { basePrice: 45, volatility: 0.04, trend: 0.0001 },
    'SPY': { basePrice: 420, volatility: 0.015, trend: 0.0001 },
    'QQQ': { basePrice: 350, volatility: 0.02, trend: 0.0001 },
    'VTI': { basePrice: 220, volatility: 0.012, trend: 0.0001 },
    'GLD': { basePrice: 180, volatility: 0.008, trend: 0.00005 },
    'BTC': { basePrice: 45000, volatility: 0.06, trend: 0.0002 },
    'ETH': { basePrice: 3000, volatility: 0.05, trend: 0.0003 },
    'SOL': { basePrice: 100, volatility: 0.08, trend: 0.0004 },
    'ADA': { basePrice: 0.5, volatility: 0.06, trend: 0.0002 },
    'DOT': { basePrice: 8, volatility: 0.07, trend: 0.0003 }
  }
  
  const params = assetParams[symbol as keyof typeof assetParams] || { basePrice: 100, volatility: 0.03, trend: 0.0001 }
  
  const data: TrainingData[] = []
  let currentPrice = params.basePrice
  const now = Date.now()
  
  // Generate 200 data points (matching Bybit fetch)
  for (let i = 0; i < 200; i++) {
    const timestamp = now - (200 - i) * 4 * 60 * 60 * 1000 // 4-hour intervals
    
    // Generate realistic OHLCV data
    const trend = params.trend * (Math.random() - 0.5) * 2
    const volatility = params.volatility * (0.5 + Math.random())
    
    const open = currentPrice
    const priceChange = currentPrice * (trend + volatility * (Math.random() - 0.5))
    const close = Math.max(0.01, open + priceChange)
    
    const high = Math.max(open, close) * (1 + Math.random() * 0.02)
    const low = Math.min(open, close) * (1 - Math.random() * 0.02)
    
    const volume = Math.floor((100000 + Math.random() * 900000) * (1 + volatility))
    
    data.push({
      timestamp,
      open,
      high,
      low,
      close,
      price: close,
      volume
    })
    
    currentPrice = close
  }
  
  return data
}

// Fetch historical data with fallback
async function fetchHistoricalData(symbol: string): Promise<TrainingData[]> {
  // For crypto symbols, try Bybit first
  if (['BTC', 'ETH', 'SOL', 'ADA', 'DOT'].some(crypto => symbol.includes(crypto))) {
    const bybitData = await fetchBybitData(symbol)
    if (bybitData.length > 0) {
      return bybitData
    }
  }
  
  // Fallback to mock data for stocks and failed crypto fetches
  return generateMockData(symbol)
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { action, symbols, userId, trainAssetSpecific = true } = await req.json()
    
    if (action === 'train') {
      console.log('🤖 Starting ASSET-SPECIFIC PPO training for specialized trading models...')
      
      const trainingSymbols = symbols || [
        // Major Stocks (10)
        'AAPL', 'GOOGL', 'MSFT', 'NVDA', 'TSLA', 'META', 'NFLX', 'AMD', 'CRM', 'UBER',
        // ETFs (4) 
        'SPY', 'QQQ', 'VTI', 'GLD',
        // Major Cryptocurrencies (5)
        'BTC', 'ETH', 'SOL', 'ADA', 'DOT',
        // Growth Stocks (5)
        'ROKU', 'SHOP', 'SQ', 'PYPL', 'ZM'
      ]

      console.log(`🎯 Training asset-specific PPO models on ${trainingSymbols.length} symbols:`, trainingSymbols)
      
      // First train general foundational model
      console.log('🏗️ Training foundational general model...')
      const generalTrainer = new AssetSpecificPPOTrainer('GENERAL')
      const generalResults = []
      
      for (const symbol of trainingSymbols.slice(0, 5)) { // Train on subset for general model
        const data = await fetchHistoricalData(symbol)
        const result = await generalTrainer.trainOnSymbol(symbol, data)
        generalResults.push(result)
      }
      
      const baseModel = generalTrainer.getModelWeights()
      console.log('✅ Foundational model training complete')
      
      // Now train asset-specific models
      const assetSpecificResults = new Map()
      
      if (trainAssetSpecific) {
        console.log('🎯 Training asset-specific models...')
        
        for (const symbol of trainingSymbols) {
          console.log(`📈 Training specialized model for ${symbol}...`)
          
          const assetTrainer = new AssetSpecificPPOTrainer(symbol, baseModel)
          const data = await fetchHistoricalData(symbol)
          const result = await assetTrainer.trainOnSymbol(symbol, data)
          
          assetSpecificResults.set(symbol, {
            model: assetTrainer.getModelWeights(),
            performance: result
          })
        }
      }
      
      const aggregatedMetrics = {
        totalSymbols: trainingSymbols.length,
        avgWinRate: Array.from(assetSpecificResults.values()).reduce((sum, r) => sum + r.performance.winRate, 0) / trainingSymbols.length,
        avgReturn: Array.from(assetSpecificResults.values()).reduce((sum, r) => sum + r.performance.avgReturn, 0) / trainingSymbols.length,
        totalTrades: Array.from(assetSpecificResults.values()).reduce((sum, r) => sum + r.performance.totalTrades, 0),
        sharpeRatio: Array.from(assetSpecificResults.values()).reduce((sum, r) => sum + (r.performance.sharpeRatio || 0), 0) / trainingSymbols.length,
        assetSpecificModels: assetSpecificResults.size
      }
      
      console.log('🎯 ASSET-SPECIFIC PPO TRAINING RESULTS:')
      console.log(`📊 Symbols: ${aggregatedMetrics.totalSymbols}`)
      console.log(`🎯 Win Rate: ${(aggregatedMetrics.avgWinRate * 100).toFixed(1)}%`)
      console.log(`💰 Average Return: ${(aggregatedMetrics.avgReturn * 100).toFixed(2)}%`)
      console.log(`📈 Total Trades: ${aggregatedMetrics.totalTrades}`)
      console.log(`🤖 Asset-Specific Models: ${aggregatedMetrics.assetSpecificModels}`)
      
      // Store training metrics and models in database
      if (userId) {
        // Store general metrics
        const { error: metricsError } = await supabase
          .from('trading_metrics')
          .upsert({
            user_id: userId,
            model_type: 'asset_specific_ppo',
            metrics: aggregatedMetrics,
            model_weights: baseModel, // Store foundational model
            created_at: new Date().toISOString()
          })
        
        if (metricsError) {
          console.error('Error storing training metrics:', metricsError)
        }
        
        // Store individual asset models
        for (const [symbol, assetData] of assetSpecificResults.entries()) {
          const { error: modelError } = await supabase
            .from('asset_models')
            .upsert({
              user_id: userId,
              symbol: symbol,
              model_type: 'ppo_specialized',
              model_weights: assetData.model,
              performance_metrics: assetData.performance,
              created_at: new Date().toISOString()
            })
          
          if (modelError) {
            console.error(`Error storing model for ${symbol}:`, modelError)
          }
        }
      }
      
      return new Response(JSON.stringify({
        success: true,
        metrics: aggregatedMetrics,
        baseModel: baseModel,
        assetModels: Object.fromEntries(assetSpecificResults)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    if (action === 'getMetrics') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'User ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      const { data, error } = await supabase
        .from('trading_metrics')
        .select('*')
        .eq('user_id', userId)
        .eq('model_type', 'asset_specific_ppo')
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (error) {
        console.error('Error fetching metrics:', error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      return new Response(JSON.stringify({
        success: true,
        metrics: data[0] || null
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('PPO training error:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})