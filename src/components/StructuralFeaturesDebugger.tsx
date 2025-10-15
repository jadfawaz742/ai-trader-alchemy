import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Activity, BarChart3, Shield, Target } from "lucide-react";

interface StructuralFeaturesDebuggerProps {
  features: {
    // Market Regime
    reg_acc: number;
    reg_adv: number;
    reg_dist: number;
    reg_decl: number;
    
    // Volatility
    vol_regime: number; // 0=low, 1=mid, 2=high
    
    // Support/Resistance
    dist_to_support: number;
    dist_to_resistance: number;
    sr_strength: number;
    
    // Fibonacci
    dist_127_up: number;
    dist_161_up: number;
    dist_127_dn: number;
    dist_161_dn: number;
    
    // Context
    atr: number;
    currentPrice: number;
  };
  confluenceScore: number;
  actionMasked: boolean;
  maskingReason?: string;
}

export const StructuralFeaturesDebugger = ({
  features,
  confluenceScore,
  actionMasked,
  maskingReason
}: StructuralFeaturesDebuggerProps) => {
  // Determine dominant regime
  const regimes = [
    { name: 'Accumulation', value: features.reg_acc, color: 'bg-blue-500' },
    { name: 'Advancing', value: features.reg_adv, color: 'bg-green-500' },
    { name: 'Distribution', value: features.reg_dist, color: 'bg-purple-500' },
    { name: 'Declining', value: features.reg_decl, color: 'bg-red-500' }
  ];
  const dominantRegime = regimes.reduce((max, r) => r.value > max.value ? r : max, regimes[0]);

  const volRegimeLabels = ['Low', 'Mid', 'High'];
  const volRegimeColors = ['text-green-600', 'text-yellow-600', 'text-red-600'];

  // Calculate price levels
  const supportPrice = features.dist_to_support > 0
    ? features.currentPrice - features.dist_to_support * features.atr
    : null;
    
  const resistancePrice = features.dist_to_resistance > 0
    ? features.currentPrice + features.dist_to_resistance * features.atr
    : null;

  return (
    <div className="space-y-4">
      {/* Action Masking Status */}
      {actionMasked && (
        <Card className="border-orange-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <Shield className="h-5 w-5" />
              Trade Entry Blocked
            </CardTitle>
            <CardDescription>{maskingReason || 'Confluence score below threshold'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Confluence Score</span>
                <span className="font-semibold">{(confluenceScore * 100).toFixed(1)}%</span>
              </div>
              <Progress value={confluenceScore * 100} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Required: ≥50% • Current: {(confluenceScore * 100).toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Market Regime */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Market Regime
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge className={dominantRegime.value > 0.5 ? '' : 'opacity-50'}>
                {dominantRegime.name}
              </Badge>
              <span className="text-sm text-muted-foreground">
                ({(dominantRegime.value * 100).toFixed(0)}% confidence)
              </span>
            </div>
            
            {regimes.map(regime => (
              <div key={regime.name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{regime.name}</span>
                  <span>{(regime.value * 100).toFixed(0)}%</span>
                </div>
                <Progress
                  value={regime.value * 100}
                  className="h-1.5"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Volatility */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Volatility Regime
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className={`text-3xl font-bold ${volRegimeColors[features.vol_regime]}`}>
              {volRegimeLabels[features.vol_regime]}
            </div>
            <div className="text-sm text-muted-foreground">
              ATR: {features.atr.toFixed(2)} ({((features.atr / features.currentPrice) * 100).toFixed(2)}% of price)
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Support & Resistance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Support & Resistance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-sm text-muted-foreground">Support</div>
                <div className="text-lg font-semibold text-green-600">
                  {supportPrice ? `$${supportPrice.toFixed(2)}` : 'N/A'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {features.dist_to_support > 0 ? `${features.dist_to_support.toFixed(2)} ATR` : '-'}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">Current</div>
                <div className="text-lg font-bold">
                  ${features.currentPrice.toFixed(2)}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">Resistance</div>
                <div className="text-lg font-semibold text-red-600">
                  {resistancePrice ? `$${resistancePrice.toFixed(2)}` : 'N/A'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {features.dist_to_resistance > 0 ? `${features.dist_to_resistance.toFixed(2)} ATR` : '-'}
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm">
                <span>S/R Strength</span>
                <span>{(features.sr_strength * 100).toFixed(0)}%</span>
              </div>
              <Progress value={features.sr_strength * 100} className="h-1.5" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fibonacci Levels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Fibonacci Targets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-semibold text-green-600 mb-2">Upside Extensions</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>1.27 Extension</span>
                  <span>{features.dist_127_up > 0 ? `+${(features.dist_127_up * 100).toFixed(1)}%` : 'Below'}</span>
                </div>
                <div className="flex justify-between">
                  <span>1.618 Extension</span>
                  <span>{features.dist_161_up > 0 ? `+${(features.dist_161_up * 100).toFixed(1)}%` : 'Below'}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-red-600 mb-2">Downside Extensions</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>1.27 Extension</span>
                  <span>{features.dist_127_dn > 0 ? `-${(features.dist_127_dn * 100).toFixed(1)}%` : 'Above'}</span>
                </div>
                <div className="flex justify-between">
                  <span>1.618 Extension</span>
                  <span>{features.dist_161_dn > 0 ? `-${(features.dist_161_dn * 100).toFixed(1)}%` : 'Above'}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confluence Summary */}
      <Card className={confluenceScore >= 0.5 ? 'border-green-500' : 'border-orange-500'}>
        <CardHeader>
          <CardTitle>Confluence Summary</CardTitle>
          <CardDescription>
            Overall structural alignment score
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-4xl font-bold text-center">
              {(confluenceScore * 100).toFixed(1)}%
            </div>
            <Progress value={confluenceScore * 100} className="h-3" />
            <div className="text-center text-sm">
              {confluenceScore >= 0.7 ? (
                <span className="text-green-600 font-semibold">✅ Strong Setup</span>
              ) : confluenceScore >= 0.5 ? (
                <span className="text-yellow-600 font-semibold">⚠️ Moderate Setup</span>
              ) : (
                <span className="text-red-600 font-semibold">❌ Weak Setup</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
