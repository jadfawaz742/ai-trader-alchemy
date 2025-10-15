import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Brain, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FeatureImportance {
  feature_name: string;
  importance: number;
  direction: 'positive' | 'negative';
}

interface ConfluenceBreakdown {
  technical: number;
  structural: number;
  regime: number;
  fibonacci: number;
}

interface TradeExplanation {
  signal_id: string;
  asset: string;
  side: string;
  confidence: number;
  top_features: FeatureImportance[];
  confluence_breakdown: ConfluenceBreakdown;
}

export function ModelExplainability({ signalId }: { signalId: string }) {
  const [explanation, setExplanation] = useState<TradeExplanation | null>(null);
  const [loading, setLoading] = useState(false);

  const explainDecision = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('explain-decision', {
        body: { signal_id: signalId }
      });

      if (error) throw error;
      setExplanation(data);
    } catch (error: any) {
      console.error('Error explaining decision:', error);
      toast.error('Failed to explain decision');
    } finally {
      setLoading(false);
    }
  };

  const confluenceData = explanation ? [
    { category: 'Technical', score: explanation.confluence_breakdown.technical },
    { category: 'Structural', score: explanation.confluence_breakdown.structural },
    { category: 'Regime', score: explanation.confluence_breakdown.regime },
    { category: 'Fibonacci', score: explanation.confluence_breakdown.fibonacci }
  ] : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Model Explainability
            </CardTitle>
            <CardDescription>
              Understand why the AI recommended this trade
            </CardDescription>
          </div>
          <Button onClick={explainDecision} disabled={loading}>
            <Info className="h-4 w-4 mr-2" />
            {loading ? 'Analyzing...' : 'Explain Decision'}
          </Button>
        </div>
      </CardHeader>
      
      {explanation && (
        <CardContent className="space-y-6">
          {/* Trade Summary */}
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <Badge variant={explanation.side === 'BUY' ? 'default' : 'destructive'} className="text-lg">
              {explanation.side}
            </Badge>
            <div>
              <p className="text-2xl font-bold">{explanation.asset}</p>
              <p className="text-sm text-muted-foreground">
                Confidence: {(explanation.confidence * 100).toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Feature Importance */}
          <div>
            <h4 className="font-semibold mb-4">Top Contributing Factors</h4>
            <div className="space-y-3">
              {explanation.top_features.map((feature) => (
                <div key={feature.feature_name} className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">{feature.feature_name}</span>
                    <div className="flex items-center gap-2">
                      {feature.direction === 'positive' ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      <span className={feature.direction === 'positive' ? 'text-green-600' : 'text-red-600'}>
                        {(feature.importance * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <Progress 
                    value={feature.importance * 100} 
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Confluence Score Breakdown */}
          <div>
            <h4 className="font-semibold mb-4">Confluence Score Breakdown</h4>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={confluenceData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="category" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))'
                  }}
                />
                <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                  {confluenceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={`hsl(var(--primary))`} opacity={0.7 + (index * 0.1)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Interpretation Guide */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-sm">
              <strong>How to interpret:</strong> Features with higher importance scores had more
              influence on the model's decision. Positive trends indicate bullish factors, while
              negative trends indicate bearish factors.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
