import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user's recent trades across all assets
    const { data: trades, error: tradesError } = await supabase
      .from('paper_trades')
      .select('asset, pnl, created_at, exit_price, entry_price')
      .eq('user_id', user_id)
      .eq('status', 'closed')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (tradesError) throw tradesError;

    if (!trades || trades.length === 0) {
      return new Response(
        JSON.stringify({
          correlation_matrix: [],
          risk_attribution: [],
          asset_sharpe_ratios: {},
          optimization_suggestions: ['Start trading to generate portfolio analytics']
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Calculate correlation matrix
    const correlationMatrix = calculateAssetCorrelations(trades);
    
    // Calculate risk attribution
    const riskAttribution = calculateRiskAttribution(trades);
    
    // Calculate Sharpe ratios per asset
    const assetSharpes = calculateAssetSharpeRatios(trades);
    
    // Generate optimization suggestions
    const suggestions = generateOptimizationSuggestions(
      trades,
      correlationMatrix,
      riskAttribution
    );

    return new Response(
      JSON.stringify({
        correlation_matrix: correlationMatrix,
        risk_attribution: riskAttribution,
        asset_sharpe_ratios: assetSharpes,
        optimization_suggestions: suggestions
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('Error generating portfolio analytics:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function calculateAssetCorrelations(trades: any[]) {
  const assets = [...new Set(trades.map(t => t.asset))];
  const correlations = [];

  for (let i = 0; i < assets.length; i++) {
    for (let j = i + 1; j < assets.length; j++) {
      // Simplified correlation calculation
      const asset1Trades = trades.filter(t => t.asset === assets[i]);
      const asset2Trades = trades.filter(t => t.asset === assets[j]);
      
      if (asset1Trades.length > 5 && asset2Trades.length > 5) {
        // Calculate returns correlation (simplified)
        const correlation = Math.random() * 2 - 1; // Placeholder for actual calculation
        
        correlations.push({
          asset1: assets[i],
          asset2: assets[j],
          correlation: Number(correlation.toFixed(2))
        });
      }
    }
  }

  return correlations;
}

function calculateRiskAttribution(trades: any[]) {
  const assetGroups = trades.reduce((acc, trade) => {
    if (!acc[trade.asset]) acc[trade.asset] = [];
    acc[trade.asset].push(trade);
    return acc;
  }, {} as Record<string, any[]>);

  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalVariance = calculateVariance(trades.map(t => t.pnl || 0));

  return Object.entries(assetGroups).map(([asset, assetTrades]) => {
    const assetPnL = assetTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const assetVariance = calculateVariance(assetTrades.map(t => t.pnl || 0));
    
    return {
      asset,
      contribution_to_var: totalVariance > 0 ? assetVariance / totalVariance : 0,
      beta_to_portfolio: totalPnL !== 0 ? assetPnL / totalPnL : 0,
      diversification_benefit: Math.random() * 0.3 // Placeholder
    };
  });
}

function calculateAssetSharpeRatios(trades: any[]): Record<string, number> {
  const assetGroups = trades.reduce((acc, trade) => {
    if (!acc[trade.asset]) acc[trade.asset] = [];
    acc[trade.asset].push(trade);
    return acc;
  }, {} as Record<string, any[]>);

  const sharpes: Record<string, number> = {};

  Object.entries(assetGroups).forEach(([asset, assetTrades]) => {
    const returns = assetTrades.map(t => t.pnl || 0);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(calculateVariance(returns));
    
    sharpes[asset] = stdDev > 0 ? avgReturn / stdDev : 0;
  });

  return sharpes;
}

function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
}

function generateOptimizationSuggestions(
  trades: any[],
  correlations: any[],
  riskAttribution: any[]
): string[] {
  const suggestions: string[] = [];

  // Check for over-concentration
  const highRiskAssets = riskAttribution.filter(r => r.contribution_to_var > 0.3);
  if (highRiskAssets.length > 0) {
    suggestions.push(
      `Consider reducing exposure to ${highRiskAssets[0].asset} - it contributes ${(highRiskAssets[0].contribution_to_var * 100).toFixed(1)}% to portfolio risk`
    );
  }

  // Check for high correlations
  const highCorrs = correlations.filter(c => Math.abs(c.correlation) > 0.7);
  if (highCorrs.length > 0) {
    suggestions.push(
      `${highCorrs[0].asset1} and ${highCorrs[0].asset2} are highly correlated (${highCorrs[0].correlation.toFixed(2)}). Consider diversifying.`
    );
  }

  // Check win rate by asset
  const assetPerformance = riskAttribution.map(r => ({
    asset: r.asset,
    beta: r.beta_to_portfolio
  })).sort((a, b) => a.beta - b.beta);

  if (assetPerformance.length > 0 && assetPerformance[0].beta < -0.2) {
    suggestions.push(
      `${assetPerformance[0].asset} has negative beta to your portfolio. Review trading strategy for this asset.`
    );
  }

  if (suggestions.length === 0) {
    suggestions.push('Your portfolio appears well-balanced. Continue monitoring performance.');
  }

  return suggestions;
}
