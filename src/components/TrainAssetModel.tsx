import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, CheckCircle2, AlertCircle } from "lucide-react";

export const TrainAssetModel = () => {
  const [symbol, setSymbol] = useState("");
  const [isTraining, setIsTraining] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleTrainAsset = async () => {
    if (!symbol.trim()) {
      toast({
        title: "Symbol Required",
        description: "Please enter a valid symbol (e.g., AAPL, BTC-USD)",
        variant: "destructive"
      });
      return;
    }

    setIsTraining(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('train-asset-model', {
        body: { symbol: symbol.trim().toUpperCase() }
      });

      if (error) throw error;

      if (data.success) {
        setResult(data);
        toast({
          title: "Model Trained Successfully! 🎉",
          description: `Fine-tuned model created for ${data.symbol} with ${data.dataPoints} data points`
        });
      }
    } catch (error: any) {
      console.error('Training error:', error);
      toast({
        title: "Training Failed",
        description: error.message || "Failed to train model for this asset",
        variant: "destructive"
      });
    } finally {
      setIsTraining(false);
    }
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Train Custom Asset Model
        </CardTitle>
        <CardDescription>
          Generate a fine-tuned PPO model for any stock or cryptocurrency
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter symbol (e.g., AAPL, BTC-USD, ETH-USD)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            disabled={isTraining}
            className="flex-1"
          />
          <Button 
            onClick={handleTrainAsset}
            disabled={isTraining || !symbol.trim()}
          >
            {isTraining ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Training...
              </>
            ) : (
              'Train Model'
            )}
          </Button>
        </div>

        {isTraining && (
          <div className="space-y-2 p-4 bg-primary/5 rounded-lg border border-primary/20">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching historical data...
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading general base model...
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fine-tuning model on asset-specific patterns...
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-3 p-4 bg-green-500/5 rounded-lg border border-green-500/20">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-semibold">Model Training Complete</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Symbol</p>
                <p className="font-semibold">{result.symbol}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Asset Type</p>
                <p className="font-semibold capitalize">{result.assetType}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Data Points</p>
                <p className="font-semibold">{result.dataPoints}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Win Rate</p>
                <p className="font-semibold">
                  {(result.metrics.test.winRate * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Test Return</p>
                <p className={`font-semibold ${result.metrics.test.totalReturn > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(result.metrics.test.totalReturn * 100).toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Sharpe Ratio</p>
                <p className="font-semibold">
                  {result.metrics.test.sharpeRatio.toFixed(3)}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-border/50">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                This model can now be used for trading {result.symbol}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold">How it works:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Fetches 2 years of historical data</li>
            <li>Fine-tunes the general PPO model on asset-specific patterns</li>
            <li>Learns volatility, trends, and indicators unique to this asset</li>
            <li>Stores the specialized model for future trading decisions</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
