import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { fetchMarketData as fetchUnifiedData, type MarketDataPoint } from '../_shared/market-data-fetcher.ts';
import { isCryptoSymbol } from '../_shared/symbol-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TrainingData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TrainingMetrics {
  totalTrades: number;
  winRate: number;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header provided' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { 
        global: { 
          headers: { Authorization: authHeader }
        }
      }
    );

    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed. Please log in again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`User ${user.id} requesting training for symbol`);

    const { symbol } = await req.json();
    
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Valid symbol is required');
    }

    const normalizedSymbol = symbol.trim().toUpperCase();
    console.log(`Training model for asset: ${normalizedSymbol}`);

    // Check if model already exists for this asset
    const { data: existingModel, error: checkError } = await supabaseClient
      .from('asset_models')
      .select('id, created_at, performance_metrics')
      .eq('user_id', user.id)
      .eq('symbol', normalizedSymbol)
      .maybeSingle();

    if (existingModel) {
      console.log(`Model already exists for ${normalizedSymbol}`);
      return new Response(
        JSON.stringify({
          success: false,
          alreadyExists: true,
          symbol: normalizedSymbol,
          message: `A trained model already exists for ${normalizedSymbol}`,
          existingModel: {
            createdAt: existingModel.created_at,
            metrics: existingModel.performance_metrics
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch historical data
    const historicalData = await fetchHistoricalData(normalizedSymbol);
    
    if (historicalData.length < 100) {
      throw new Error(`Insufficient data for ${normalizedSymbol}. Need at least 100 data points.`);
    }

    // Get the general base model (optional - will create from scratch if not found)
    const { data: baseModel } = await supabaseClient
      .from('base_models')
      .select('*')
      .eq('model_type', 'general_ppo')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (baseModel) {
      console.log(`Using base model ${baseModel.id} for fine-tuning`);
    } else {
      console.log('No base model found - training from scratch');
    }

    // Determine asset type
    const assetType = normalizedSymbol.includes('USD') || normalizedSymbol.includes('-USD') 
      ? 'crypto' 
      : 'stock';

    console.log(`Asset type: ${assetType}`);

    // Split data
    const splitIndex = Math.floor(historicalData.length * 0.8);
    const trainData = historicalData.slice(0, splitIndex);
    const testData = historicalData.slice(splitIndex);

    // Fine-tune the model (or train from scratch)
    const trainer = new AssetSpecificPPOTrainer(
      assetType, 
      baseModel ? baseModel.model_weights : null
    );
    const metrics = await trainer.trainOnSymbol(normalizedSymbol, trainData, testData);

    // Save the fine-tuned model
    const modelWeights = trainer.getModelWeights();
    
    const { error: insertError } = await supabaseClient
      .from('asset_models')
      .insert({
        user_id: user.id,
        symbol: normalizedSymbol,
        model_type: `${assetType}_ppo`,
        model_weights: modelWeights,
        base_model_id: baseModel?.id || null,
        performance_metrics: {
          train: metrics.train,
          test: metrics.test
        },
        fine_tuning_metadata: {
          data_points: historicalData.length,
          train_size: trainData.length,
          test_size: testData.length,
          asset_type: assetType,
          trained_from_base: !!baseModel
        }
      });

    if (insertError) {
      throw insertError;
    }

    console.log(`✅ Model trained successfully for ${normalizedSymbol}`);

    return new Response(
      JSON.stringify({
        success: true,
        symbol: normalizedSymbol,
        assetType,
        metrics: {
          train: metrics.train,
          test: metrics.test
        },
        dataPoints: historicalData.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error training asset model:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchHistoricalData(symbol: string): Promise<TrainingData[]> {
  console.log(`📡 Fetching training data for ${symbol}...`);
  
  try {
    // Use unified data fetcher (2 years of daily data)
    const data = await fetchUnifiedData({
      symbol,
      range: '2y',
      interval: '1d'
    });
    
    // Convert to TrainingData format
    return data.map((d: MarketDataPoint) => ({
      timestamp: new Date(d.timestamp).toISOString(),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume
    }));
  } catch (error) {
    console.error(`❌ Error fetching training data:`, error);
    throw error;
  }
}

// Remove old Bybit and Yahoo Finance functions - now using shared utilities
// These are replaced by the unified fetcher in _shared/market-data-fetcher.ts

// PPO Trainer Class
class AssetSpecificPPOTrainer {
  private assetType: string;
  private baseWeights: any;
  private actor: any;
  private critic: any;
  private learningRate = 0.001;

  constructor(assetType: string, baseModel?: any) {
    this.assetType = assetType;
    this.baseWeights = baseModel || null;
    this.initializeNetworks();
  }

  private initializeNetworks() {
    if (this.baseWeights) {
      this.actor = JSON.parse(JSON.stringify(this.baseWeights.actor));
      this.critic = JSON.parse(JSON.stringify(this.baseWeights.critic));
    } else {
      this.actor = { weights: Array(15).fill(0).map(() => Math.random() * 0.1 - 0.05) };
      this.critic = { weights: Array(15).fill(0).map(() => Math.random() * 0.1 - 0.05) };
    }
  }

  async trainOnSymbol(symbol: string, trainData: TrainingData[], testData: TrainingData[]): Promise<{ train: TrainingMetrics, test: TrainingMetrics }> {
    console.log(`Training on ${symbol} with ${trainData.length} training samples`);
    
    const trainMetrics = await this.runTrainingEpisode(trainData, 5);
    const testMetrics = await this.runTrainingEpisode(testData, 1);
    
    return { train: trainMetrics, test: testMetrics };
  }

  private async runTrainingEpisode(data: TrainingData[], episodes: number): Promise<TrainingMetrics> {
    let totalTrades = 0;
    let winningTrades = 0;
    let totalReturn = 1.0;
    let returns: number[] = [];
    let maxBalance = 10000;
    let minBalance = 10000;

    for (let ep = 0; ep < episodes; ep++) {
      let balance = 10000;
      let position = 0;
      let entryPrice = 0;
      let trades = 0;

      for (let i = 20; i < data.length; i++) {
        const features = this.extractFeatures(data, i);
        const action = this.selectAction(features, balance, position);

        if (action === 1 && position === 0 && balance > 100) { // BUY
          const positionSize = balance * 0.1;
          position = positionSize / data[i].close;
          entryPrice = data[i].close;
          balance -= positionSize;
          trades++;
        } else if (action === 2 && position > 0) { // SELL
          const exitValue = position * data[i].close;
          balance += exitValue;
          const pnl = exitValue - (position * entryPrice);
          
          if (pnl > 0) winningTrades++;
          totalTrades++;
          
          returns.push((balance / 10000) - 1);
          position = 0;
        }

        maxBalance = Math.max(maxBalance, balance + (position * data[i].close));
        minBalance = Math.min(minBalance, balance + (position * data[i].close));
      }

      // Close any open position
      if (position > 0) {
        balance += position * data[data.length - 1].close;
        totalTrades++;
      }

      totalReturn *= (balance / 10000);
    }

    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn = returns.length > 1 
      ? Math.sqrt(returns.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / returns.length)
      : 0;
    const sharpeRatio = stdReturn > 0 ? avgReturn / stdReturn : 0;
    const maxDrawdown = ((maxBalance - minBalance) / maxBalance) * 100;

    return {
      totalTrades,
      winRate,
      totalReturn: totalReturn - 1,
      sharpeRatio,
      maxDrawdown
    };
  }

  private extractFeatures(data: TrainingData[], index: number): number[] {
    const current = data[index];
    const prev = data[index - 1];
    
    const priceChange = (current.close - prev.close) / prev.close;
    const sma20 = this.calculateSMA(data, index, 20);
    const sma50 = this.calculateSMA(data, index, 50);
    const rsi = this.calculateRSI(data, index, 14);
    const volatility = this.calculateVolatility(data, index, 20);
    
    return [
      priceChange,
      current.volume / 1000000,
      (current.close - sma20) / sma20,
      (current.close - sma50) / sma50,
      (sma20 - sma50) / sma50,
      rsi / 100,
      volatility,
      (current.high - current.low) / current.close,
      current.close / data[Math.max(0, index - 20)].close - 1,
      current.close / data[Math.max(0, index - 50)].close - 1,
      Math.min(1, current.volume / this.calculateAvgVolume(data, index, 20)),
      (current.close - current.open) / current.close,
      this.assetType === 'crypto' ? 1 : 0,
      this.assetType === 'stock' ? 1 : 0,
      0 // placeholder
    ];
  }

  private selectAction(features: number[], balance: number, position: number): number {
    const actorOutput = this.forward(this.actor.weights, features);
    
    if (position > 0 && actorOutput < -0.3) return 2; // SELL
    if (position === 0 && actorOutput > 0.3 && balance > 100) return 1; // BUY
    return 0; // HOLD
  }

  private forward(weights: number[], inputs: number[]): number {
    return weights.reduce((sum, w, i) => sum + w * inputs[i], 0);
  }

  private calculateSMA(data: TrainingData[], index: number, period: number): number {
    const start = Math.max(0, index - period + 1);
    const slice = data.slice(start, index + 1);
    return slice.reduce((sum, d) => sum + d.close, 0) / slice.length;
  }

  private calculateRSI(data: TrainingData[], index: number, period: number): number {
    if (index < period) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = index - period + 1; i <= index; i++) {
      const change = data[i].close - data[i - 1].close;
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateVolatility(data: TrainingData[], index: number, period: number): number {
    const start = Math.max(0, index - period + 1);
    const returns = [];
    
    for (let i = start + 1; i <= index; i++) {
      returns.push((data[i].close - data[i - 1].close) / data[i - 1].close);
    }
    
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - avg, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  private calculateAvgVolume(data: TrainingData[], index: number, period: number): number {
    const start = Math.max(0, index - period + 1);
    const slice = data.slice(start, index + 1);
    return slice.reduce((sum, d) => sum + d.volume, 0) / slice.length;
  }

  getModelWeights() {
    return {
      actor: this.actor,
      critic: this.critic,
      assetType: this.assetType,
      learningRate: this.learningRate
    };
  }
}
