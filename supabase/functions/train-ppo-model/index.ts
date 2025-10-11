import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchMarketData as fetchUnifiedData } from '../_shared/market-data-fetcher.ts';
import { isCryptoSymbol } from '../_shared/symbol-utils.ts';

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
  private epsilon = 0.3 // Exploration rate - 30% random actions
  private minTradesPerEpisode = 5 // Force minimum trades per episode

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

  async trainOnSymbol(symbol: string, trainData: TrainingData[], testData: TrainingData[]): Promise<{ train: TrainingMetrics, test: TrainingMetrics }> {
    console.log(`🎯 Training asset-specific PPO model for ${symbol} (${this.assetType})...`)
    const startTime = Date.now()
    
    // TRAINING PHASE
    let trainTotalReward = 0
    let trainTotalTrades = 0
    let trainWinningTrades = 0
    const buffer: any[] = []
    
    // Simulate trading episodes with asset-specific behavior
    const episodes = 5
    for (let episode = 0; episode < episodes; episode++) {
      let position = 0 // -1: short, 0: neutral, 1: long
      let balance = 10000
      let shares = 0
      let episodeTrades = 0
      let lastTradeIndex = -1
      
      for (let i = 20; i < trainData.length - 1; i++) {
        const features = this.extractFeatures(trainData, i)
        
        // FORCED TRADE MECHANISM: Ensure minimum trades per episode
        const shouldForceExplore = episodeTrades < this.minTradesPerEpisode && 
                                   i > lastTradeIndex + 10 && // At least 10 periods between forced trades
                                   (trainData.length - i) > 20 // Ensure enough data left
        
        const action = this.selectSmartAction(features, trainData, i, position > 0, shouldForceExplore)
        const nextPrice = trainData[i + 1].price
        const currentPrice = trainData[i].price
        
        let reward = 0
        let traded = false
        
        // Execute trading action with asset-specific considerations
        if (action === 0 && position <= 0) { // BUY
          const tradeSize = Math.floor(balance * 0.95 / currentPrice)
          if (tradeSize > 0) {
            const entryPrice = currentPrice
            shares += tradeSize
            balance -= tradeSize * currentPrice
            position = 1
            traded = true
            trainTotalTrades++
            episodeTrades++
            lastTradeIndex = i
            
            // AGGRESSIVE REWARD: Immediate small reward for taking action
            reward = 0.5 // Reward for entering position
          }
        } else if (action === 1 && position >= 0) { // SELL
          if (shares > 0) {
            const saleValue = shares * currentPrice
            const costBasis = 10000 - balance + saleValue
            balance += saleValue
            
            // AGGRESSIVE REWARD FUNCTION
            const returnRate = (saleValue - (costBasis - balance)) / (costBasis - balance)
            reward = returnRate * 200 // Doubled scale for more aggressive learning
            
            // Additional reward bonuses
            if (reward > 0) {
              trainWinningTrades++
              reward *= 1.5 // 50% bonus for winning trades
            } else {
              reward *= 0.8 // Slightly reduce penalty for losing trades to encourage exploration
            }
            
            // Bonus for quick profitable trades
            const holdTime = i - lastTradeIndex
            if (reward > 0 && holdTime < 20) {
              reward *= 1.3 // Bonus for quick profits
            }
            
            shares = 0
            position = -1
            traded = true
            trainTotalTrades++
            episodeTrades++
            lastTradeIndex = i
          }
        }
        
        // Enhanced reward function for asset-specific training
        if (traded) {
          // Asset-specific reward adjustments
          const volatilityBonus = this.assetCharacteristics.volatility === 'high' ? 1.3 : 1.0
          const liquidityBonus = this.assetCharacteristics.liquidity === 'high' ? 1.2 : 1.0
          reward *= volatilityBonus * liquidityBonus
          
          trainTotalReward += reward
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
      
      // Log episode trades
      console.log(`  Episode ${episode + 1}: ${episodeTrades} trades executed`)
      
      // Update networks every episode
      if (buffer.length > 0) {
        this.updateNetworks(buffer.filter(b => b.traded))
      }
    }
    
    const trainAvgReturn = trainTotalTrades > 0 ? trainTotalReward / trainTotalTrades : 0
    const trainWinRate = trainTotalTrades > 0 ? trainWinningTrades / trainTotalTrades : 0
    const trainingDuration = Date.now() - startTime
    
    // TESTING PHASE (No training, just evaluation)
    let testTotalReward = 0
    let testTotalTrades = 0
    let testWinningTrades = 0
    let position = 0
    let balance = 10000
    let shares = 0
    let lastTradeIndex = -1
    
    for (let i = 20; i < testData.length - 1; i++) {
      const features = this.extractFeatures(testData, i)
      // No forced exploration during testing - pure exploitation
      const action = this.selectSmartAction(features, testData, i, position > 0, false)
      const currentPrice = testData[i].price
      
      let reward = 0
      
      if (action === 0 && position <= 0) { // BUY
        const tradeSize = Math.floor(balance * 0.95 / currentPrice)
        if (tradeSize > 0) {
          shares += tradeSize
          balance -= tradeSize * currentPrice
          position = 1
          testTotalTrades++
          lastTradeIndex = i
        }
      } else if (action === 1 && position >= 0) { // SELL
        if (shares > 0) {
          const saleValue = shares * currentPrice
          const costBasis = 10000 - balance + saleValue
          balance += saleValue
          
          const returnRate = (saleValue - (costBasis - balance)) / (costBasis - balance)
          reward = returnRate * 100
          
          if (reward > 0) testWinningTrades++
          
          testTotalReward += reward
          shares = 0
          position = -1
          testTotalTrades++
          lastTradeIndex = i
        }
      }
    }
    
    // Close any open position at the end of test period
    if (shares > 0) {
      const finalPrice = testData[testData.length - 1].price
      const saleValue = shares * finalPrice
      const costBasis = 10000 - balance + saleValue
      balance += saleValue
      const returnRate = (saleValue - (costBasis - balance)) / (costBasis - balance)
      const reward = returnRate * 100
      if (reward > 0) testWinningTrades++
      testTotalReward += reward
      testTotalTrades++
    }
    
    const testAvgReturn = testTotalTrades > 0 ? testTotalReward / testTotalTrades : 0
    const testWinRate = testTotalTrades > 0 ? testWinningTrades / testTotalTrades : 0
    
    const trainMetrics: TrainingMetrics = {
      symbol,
      winRate: trainWinRate,
      avgReturn: trainAvgReturn / 100,
      totalTrades: trainTotalTrades,
      sharpeRatio: this.calculateSharpeRatio(buffer),
      trainingDuration
    }
    
    const testMetrics: TrainingMetrics = {
      symbol,
      winRate: testWinRate,
      avgReturn: testAvgReturn / 100,
      totalTrades: testTotalTrades,
      sharpeRatio: 0,
      trainingDuration: 0
    }
    
    this.trainingHistory.push(trainMetrics)
    
    console.log(`✅ ${symbol}: Train=${(trainWinRate * 100).toFixed(1)}% (${trainTotalTrades} trades) | Test=${(testWinRate * 100).toFixed(1)}% (${testTotalTrades} trades)`)
    
    return { train: trainMetrics, test: testMetrics }
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

  private selectSmartAction(features: number[], data: TrainingData[], index: number, inPosition: boolean, forceExplore: boolean = false): number {
    // EXPLORATION: Random action with epsilon probability or when forced
    if (forceExplore || Math.random() < this.epsilon) {
      if (!inPosition) {
        // More likely to buy when not in position (70% buy, 30% hold)
        return Math.random() < 0.7 ? 0 : 2
      } else {
        // More likely to sell when in position (70% sell, 30% hold)
        return Math.random() < 0.7 ? 1 : 2
      }
    }
    
    const actionProbs = this.forward(this.actor, features)
    
    // Enhanced action selection with AGGRESSIVE technical indicators
    const rsi = features[7] * 100 // RSI feature
    const macd = features[8] // MACD feature
    const volatility = features[9] // Volatility feature
    const sma10Above = features[5] // Above SMA10
    const sma20Above = features[6] // Above SMA20
    
    // Asset-specific signal strength adjustments
    const { sensitivity, volatility: assetVolatility } = this.assetCharacteristics
    const sensitivityMultiplier = sensitivity === 'high' ? 1.5 : sensitivity === 'low' ? 0.8 : 1.0
    
    // AGGRESSIVE: Lowered thresholds and increased signal weights
    const buySignal = (
      (rsi < 50 ? 0.5 : 0) +           // Raised from 30 to 50
      (macd > -0.01 ? 0.4 : 0) +       // More lenient threshold
      (sma10Above ? 0.3 : 0) +         // Trend following
      (volatility > 0.01 ? 0.2 : 0)    // Any volatility is good for trading
    )
    
    const sellSignal = (
      (rsi > 50 ? 0.5 : 0) +           // Lowered from 70 to 50
      (macd < 0.01 ? 0.4 : 0) +        // More lenient threshold
      (!sma10Above ? 0.3 : 0) +        // Trend following
      (volatility > 0.01 ? 0.2 : 0)    // Any volatility is good for trading
    )
    
    // Apply AGGRESSIVE asset-specific adjustments
    const adjustedBuySignal = buySignal * sensitivityMultiplier * 1.5
    const adjustedSellSignal = sellSignal * sensitivityMultiplier * 1.5
    
    // Modify action probabilities AGGRESSIVELY
    const modifiedProbs = [...actionProbs]
    
    if (!inPosition) {
      modifiedProbs[0] *= (1 + adjustedBuySignal * 2) // BUY - doubled multiplier
      modifiedProbs[2] *= 0.3 // Heavily reduce HOLD
    } else {
      modifiedProbs[1] *= (1 + adjustedSellSignal * 2) // SELL - doubled multiplier
      modifiedProbs[2] *= 0.3 // Heavily reduce HOLD
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

import { fetchMarketData as fetchUnifiedData } from '../_shared/market-data-fetcher.ts';
import { isCryptoSymbol } from '../_shared/symbol-utils.ts';

// Remove duplicate fetch functions - now using shared utilities
async function fetchHistoricalData(symbol: string): Promise<TrainingData[]> {
  console.log(`📡 Fetching training data for ${symbol}...`);
  
  try {
    // Use unified data fetcher
    const data = await fetchUnifiedData({
      symbol,
      range: '6mo',
      interval: '1d'
    });
    
    // Convert to TrainingData format
    return data.map((d: any) => ({
      timestamp: d.timestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      price: d.close,
      volume: d.volume
    }));
  } catch (error) {
    console.error(`❌ Error fetching training data:`, error);
    throw error;
  }
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
      console.log(`📊 Using 80% training data and 20% test data split`)
      
      // First train general foundational model
      console.log('\n🏗️ PHASE 1: Training foundational general model...')
      const generalTrainer = new AssetSpecificPPOTrainer('GENERAL')
      const generalResults = []
      
      for (const symbol of trainingSymbols.slice(0, 5)) {
        try {
          const data = await fetchHistoricalData(symbol)
          
          // Split data: 80% train, 20% test
          const splitIndex = Math.floor(data.length * 0.8)
          const trainData = data.slice(0, splitIndex)
          const testData = data.slice(splitIndex)
          
          console.log(`📊 ${symbol}: ${trainData.length} train samples, ${testData.length} test samples`)
          const result = await generalTrainer.trainOnSymbol(symbol, trainData, testData)
          generalResults.push(result)
        } catch (error) {
          console.error(`❌ Failed to train general model on ${symbol}:`, error instanceof Error ? error.message : 'Unknown error')
        }
      }
      
      const baseModel = generalTrainer.getModelWeights()
      console.log('✅ Foundational model training complete\n')
      
      // Now train asset-specific models
      const assetSpecificResults = new Map()
      const detailedPerformance: any[] = []
      
      if (trainAssetSpecific) {
        console.log('🎯 PHASE 2: Training asset-specific models...\n')
        
        for (const symbol of trainingSymbols) {
          try {
            console.log(`📈 Training specialized model for ${symbol}...`)
            
            const assetTrainer = new AssetSpecificPPOTrainer(symbol, baseModel)
            const data = await fetchHistoricalData(symbol)
            
            // Split data: 80% train, 20% test
            const splitIndex = Math.floor(data.length * 0.8)
            const trainData = data.slice(0, splitIndex)
            const testData = data.slice(splitIndex)
            
            console.log(`📊 ${symbol}: ${trainData.length} train samples, ${testData.length} test samples`)
            const result = await assetTrainer.trainOnSymbol(symbol, trainData, testData)
            
            assetSpecificResults.set(symbol, {
              model: assetTrainer.getModelWeights(),
              performance: result
            })
            
            detailedPerformance.push({
              symbol,
              train: result.train,
              test: result.test
            })
          } catch (error) {
            console.error(`❌ Failed to train ${symbol}:`, error instanceof Error ? error.message : 'Unknown error')
          }
        }
      }
      
      // Calculate aggregated metrics
      const trainResults = detailedPerformance.map(p => p.train)
      const testResults = detailedPerformance.map(p => p.test)
      
      const aggregatedMetrics = {
        totalSymbols: detailedPerformance.length,
        training: {
          avgWinRate: trainResults.reduce((sum, r) => sum + r.winRate, 0) / trainResults.length,
          avgReturn: trainResults.reduce((sum, r) => sum + r.avgReturn, 0) / trainResults.length,
          totalTrades: trainResults.reduce((sum, r) => sum + r.totalTrades, 0),
          sharpeRatio: trainResults.reduce((sum, r) => sum + (r.sharpeRatio || 0), 0) / trainResults.length
        },
        testing: {
          avgWinRate: testResults.reduce((sum, r) => sum + r.winRate, 0) / testResults.length,
          avgReturn: testResults.reduce((sum, r) => sum + r.avgReturn, 0) / testResults.length,
          totalTrades: testResults.reduce((sum, r) => sum + r.totalTrades, 0)
        },
        assetSpecificModels: assetSpecificResults.size,
        detailedPerformance
      }
      
      console.log('\n' + '='.repeat(60))
      console.log('🎯 ASSET-SPECIFIC PPO TRAINING RESULTS')
      console.log('='.repeat(60))
      console.log(`\n📊 Total Symbols Trained: ${aggregatedMetrics.totalSymbols}`)
      console.log(`🤖 Asset-Specific Models Created: ${aggregatedMetrics.assetSpecificModels}`)
      
      console.log('\n📈 TRAINING SET PERFORMANCE (80% of data):')
      console.log(`   Win Rate: ${(aggregatedMetrics.training.avgWinRate * 100).toFixed(2)}%`)
      console.log(`   Average Return: ${(aggregatedMetrics.training.avgReturn * 100).toFixed(3)}%`)
      console.log(`   Total Trades: ${aggregatedMetrics.training.totalTrades}`)
      console.log(`   Sharpe Ratio: ${aggregatedMetrics.training.sharpeRatio.toFixed(3)}`)
      
      console.log('\n🧪 TEST SET PERFORMANCE (20% of data):')
      console.log(`   Win Rate: ${(aggregatedMetrics.testing.avgWinRate * 100).toFixed(2)}%`)
      console.log(`   Average Return: ${(aggregatedMetrics.testing.avgReturn * 100).toFixed(3)}%`)
      console.log(`   Total Trades: ${aggregatedMetrics.testing.totalTrades}`)
      
      console.log('\n📋 DETAILED PERFORMANCE BY ASSET:')
      detailedPerformance.forEach(p => {
        console.log(`\n   ${p.symbol}:`)
        console.log(`      Train: ${(p.train.winRate * 100).toFixed(1)}% win rate, ${(p.train.avgReturn * 100).toFixed(2)}% avg return, ${p.train.totalTrades} trades`)
        console.log(`      Test:  ${(p.test.winRate * 100).toFixed(1)}% win rate, ${(p.test.avgReturn * 100).toFixed(2)}% avg return, ${p.test.totalTrades} trades`)
      })
      
      console.log('\n' + '='.repeat(60))
      
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