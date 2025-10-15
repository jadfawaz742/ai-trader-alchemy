import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FeatureImportance {
  feature_name: string;
  importance: number;
  direction: 'positive' | 'negative';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signal_id } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch signal with all features
    const { data: signal, error: signalError } = await supabase
      .from('signals')
      .select('*, structural_features')
      .eq('id', signal_id)
      .single();

    if (signalError || !signal) {
      throw new Error('Signal not found');
    }

    // Calculate feature importance using attribution analysis
    const featureImportance = calculateFeatureContributions(signal);
    
    // Breakdown confluence score components
    const confluenceBreakdown = analyzeConfluenceComponents(signal);

    return new Response(
      JSON.stringify({
        signal_id,
        asset: signal.asset,
        side: signal.side,
        confidence: signal.confluence_score || 0,
        top_features: featureImportance,
        confluence_breakdown: confluenceBreakdown
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('Error explaining decision:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function calculateFeatureContributions(signal: any): FeatureImportance[] {
  const features: FeatureImportance[] = [];
  const sf = signal.structural_features || {};
  
  // ATR contribution (volatility)
  if (sf.atr) {
    features.push({
      feature_name: 'Volatility (ATR)',
      importance: Math.min(sf.atr / 100, 1) * 0.15,
      direction: 'positive'
    });
  }
  
  // Fibonacci alignment
  if (sf.fib_alignment !== undefined) {
    features.push({
      feature_name: 'Fibonacci Alignment',
      importance: Math.abs(sf.fib_alignment || 0) * 0.25,
      direction: sf.fib_alignment > 0.7 ? 'positive' : 'negative'
    });
  }
  
  // Support/resistance proximity
  if (sf.dist_to_support !== undefined && sf.dist_to_resistance !== undefined) {
    const srStrength = Math.abs(sf.dist_to_support - sf.dist_to_resistance);
    features.push({
      feature_name: 'Support/Resistance Structure',
      importance: Math.min(srStrength / 50, 1) * 0.20,
      direction: sf.dist_to_support < sf.dist_to_resistance ? 'positive' : 'negative'
    });
  }
  
  // Market regime
  const regimeScore = (sf.regime_adv || 0) + (sf.regime_acc || 0);
  features.push({
    feature_name: 'Market Regime',
    importance: Math.min(regimeScore, 1) * 0.20,
    direction: regimeScore > 0.5 ? 'positive' : 'negative'
  });
  
  // Confluence score contribution
  features.push({
    feature_name: 'Overall Confluence',
    importance: (signal.confluence_score || 0) * 0.20,
    direction: 'positive'
  });
  
  return features.sort((a, b) => b.importance - a.importance).slice(0, 5);
}

function analyzeConfluenceComponents(signal: any) {
  const sf = signal.structural_features || {};
  
  return {
    technical: Math.min((sf.atr || 0) / 100, 1),
    structural: Math.min((sf.sr_strength || 0) / 100, 1),
    regime: (sf.regime_adv || 0) + (sf.regime_acc || 0),
    fibonacci: sf.fib_alignment || 0
  };
}
