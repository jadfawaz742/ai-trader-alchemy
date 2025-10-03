import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const RetrainModelsButton: React.FC = () => {
  const [isTraining, setIsTraining] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<'idle' | 'training' | 'success' | 'error'>('idle');
  const [results, setResults] = useState<any>(null);
  const { toast } = useToast();

  const startRetraining = async () => {
    setIsTraining(true);
    setTrainingStatus('training');
    setResults(null);

    try {
      toast({
        title: "🤖 Starting Model Retraining",
        description: "Training asset-specific PPO models with real Yahoo Finance & Bybit data...",
      });

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Trigger training for all assets
      const { data, error } = await supabase.functions.invoke('train-ppo-model', {
        body: {
          action: 'train',
          symbols: [
            // Major Stocks
            'AAPL', 'GOOGL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'ROKU', 'SHOP',
            // ETFs
            'SPY', 'QQQ', 'VTI',
            // Major Cryptocurrencies
            'BTC-USD', 'ETH-USD'
          ],
          userId: user.id,
          trainAssetSpecific: true
        }
      });

      if (error) {
        throw error;
      }

      setResults(data);
      setTrainingStatus('success');
      
      toast({
        title: "✅ Training Complete!",
        description: `Successfully trained ${data.metrics.totalSymbols} asset-specific models with real data.`,
      });

    } catch (error: any) {
      console.error('Training error:', error);
      setTrainingStatus('error');
      
      toast({
        title: "❌ Training Failed",
        description: error.message || "Failed to train models. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsTraining(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          Model Retraining with Real Data
        </CardTitle>
        <CardDescription>
          Retrain all asset-specific PPO models using real historical data from Yahoo Finance (stocks) and Bybit (crypto)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={startRetraining}
          disabled={isTraining}
          className="w-full"
          size="lg"
        >
          {isTraining ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Training Models...
            </>
          ) : (
            <>
              <Brain className="mr-2 h-4 w-4" />
              Start Retraining
            </>
          )}
        </Button>

        {trainingStatus === 'training' && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-medium">Training in progress...</span>
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
              This may take several minutes. The bot is learning from real historical price data.
            </p>
          </div>
        )}

        {trainingStatus === 'success' && results && (
          <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-3">
              <CheckCircle className="h-4 w-4" />
              <span className="font-medium">Training Successful!</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-muted-foreground">Assets Trained:</div>
                <div className="font-medium">{results.metrics.totalSymbols}</div>
                
                <div className="text-muted-foreground">Avg Win Rate (Train):</div>
                <div className="font-medium text-green-600">
                  {(results.metrics.training.avgWinRate * 100).toFixed(1)}%
                </div>
                
                <div className="text-muted-foreground">Avg Win Rate (Test):</div>
                <div className="font-medium text-green-600">
                  {(results.metrics.testing.avgWinRate * 100).toFixed(1)}%
                </div>
                
                <div className="text-muted-foreground">Total Trades:</div>
                <div className="font-medium">
                  {results.metrics.training.totalTrades + results.metrics.testing.totalTrades}
                </div>
                
                <div className="text-muted-foreground">Sharpe Ratio:</div>
                <div className="font-medium">
                  {results.metrics.training.sharpeRatio.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}

        {trainingStatus === 'error' && (
          <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <XCircle className="h-4 w-4" />
              <span className="font-medium">Training failed. Please try again.</span>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p>✅ All random/mock data removed</p>
          <p>✅ Using real Yahoo Finance prices for stocks</p>
          <p>✅ Using real Bybit prices for cryptocurrencies</p>
          <p>✅ Technical indicators calculated from real OHLCV data</p>
          <p>✅ Multi-timeframe analysis from actual price trends</p>
          <p>🌊 Market phase detection for adaptive trading</p>
        </div>
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          <p><strong>Enhanced Training Features:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>🌊 Market Phase Detection: Identifies accumulation, uptrend, distribution, and downtrend phases</li>
            <li>📊 Multi-timeframe analysis: Hourly, 4-hour, and daily perspectives</li>
            <li>📐 Fibonacci levels: 38.2%, 50%, 61.8% retracements and 127.2%, 161.8% extensions</li>
            <li>🎯 Support/Resistance: Dynamic levels based on swing highs/lows</li>
            <li>🧠 Adaptive learning: Models adjust based on past performance</li>
            <li>⚡ Phase-aware trading: Confidence adjusted by market phase (accumulation/distribution favor retracements, trends favor extensions)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};