import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Experience {
  state: number[];
  action: number;
  reward: number;
  next_state: number[];
  done: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Check if online learning is enabled
    const { data: learningFlag } = await supabaseClient
      .from('feature_flags')
      .select('*')
      .eq('key', 'online_learning_enabled')
      .single();

    if (!learningFlag?.enabled) {
      console.log('Online learning disabled');
      return new Response(JSON.stringify({ 
        message: 'Online learning disabled',
        updates_performed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { asset } = await req.json();

    if (!asset) {
      return new Response(JSON.stringify({ error: 'Asset required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting online PPO update for ${asset}`);

    // Get shadow model for this asset
    let { data: shadowModel } = await supabaseClient
      .from('models')
      .select('*')
      .eq('asset', asset)
      .eq('status', 'shadow')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // If no shadow exists, clone from active
    if (!shadowModel) {
      const { data: activeModel } = await supabaseClient
        .from('models')
        .select('*')
        .eq('asset', asset)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!activeModel) {
        return new Response(JSON.stringify({ error: 'No model found for asset' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create shadow clone
      const shadowVersion = `${activeModel.version}_shadow_${Date.now()}`;
      const { data: newShadow } = await supabaseClient
        .from('models')
        .insert({
          asset: activeModel.asset,
          version: shadowVersion,
          status: 'shadow',
          model_type: activeModel.model_type,
          location: activeModel.location, // Will update after training
          metadata: {
            ...activeModel.metadata,
            cloned_from: activeModel.version,
            created_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      shadowModel = newShadow;
      console.log(`Created shadow model ${shadowVersion} from ${activeModel.version}`);
    }

    // Collect recent experiences for this asset
    const { data: recentEpisodes, error: episodesError } = await supabaseClient
      .from('episodes')
      .select('*')
      .eq('asset', asset)
      .eq('version', shadowModel.version)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24h
      .order('created_at', { ascending: false })
      .limit(100);

    if (episodesError || !recentEpisodes || recentEpisodes.length < 10) {
      console.log(`Insufficient experience data for ${asset}: ${recentEpisodes?.length || 0} episodes`);
      return new Response(JSON.stringify({
        message: 'Insufficient experience data',
        episodes_count: recentEpisodes?.length || 0,
        min_required: 10,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Collected ${recentEpisodes.length} episodes for training`);

    // Load experiences from storage (simplified - in production, load from bucket_uri)
    const experiences: Experience[] = await loadExperiences(recentEpisodes);

    if (experiences.length < 32) {
      console.log(`Insufficient transitions: ${experiences.length}`);
      return new Response(JSON.stringify({
        message: 'Insufficient transitions',
        transitions_count: experiences.length,
        min_required: 32,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get PPO hyperparameters
    const clipRange = parseFloat(Deno.env.get('PPO_CLIP_RANGE') || '0.1');
    const targetKL = parseFloat(Deno.env.get('PPO_TARGET_KL') || '0.02');
    const learningRate = parseFloat(Deno.env.get('PPO_LR') || '0.00003');
    const maxKLDiv = parseFloat(Deno.env.get('MAX_KL_DIVERGENCE') || '0.05');

    // Perform PPO update
    const updateResult = await performPPOUpdate(
      shadowModel,
      experiences,
      { clipRange, targetKL, learningRate, maxKLDiv }
    );

    if (!updateResult.success) {
      console.error(`PPO update failed: ${updateResult.error}`);
      return new Response(JSON.stringify({
        error: 'PPO update failed',
        details: updateResult.error,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Safety checks on update
    if (updateResult.kl_divergence > maxKLDiv) {
      console.warn(`KL divergence too high: ${updateResult.kl_divergence}, rolling back update`);
      
      // Don't save the update, keep previous weights
      return new Response(JSON.stringify({
        message: 'Update rejected - KL divergence too high',
        kl_divergence: updateResult.kl_divergence,
        max_allowed: maxKLDiv,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Save updated model weights (in production, save to storage)
    const updatedLocation = `models/${asset}/${shadowModel.version}_updated_${Date.now()}.json`;
    
    await supabaseClient
      .from('models')
      .update({
        location: updatedLocation,
        metadata: {
          ...shadowModel.metadata,
          last_update: new Date().toISOString(),
          update_metrics: updateResult,
          total_updates: (shadowModel.metadata?.total_updates || 0) + 1,
        },
      })
      .eq('id', shadowModel.id);

    // Update model metrics
    await supabaseClient
      .from('model_metrics')
      .upsert({
        asset,
        version: shadowModel.version,
        total_trades: (shadowModel.metadata?.total_trades || 0) + experiences.length,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'asset,version',
      });

    console.log(`PPO update completed for ${asset}, KL: ${updateResult.kl_divergence}`);

    // Check if shadow should be promoted
    const shouldPromote = await evaluatePromotion(supabaseClient, asset, shadowModel.version);
    
    if (shouldPromote.promote) {
      console.log(`Shadow model ${shadowModel.version} eligible for promotion`);
      // Trigger promotion (will be handled by promote-model function)
    }

    return new Response(JSON.stringify({
      success: true,
      asset,
      shadow_version: shadowModel.version,
      experiences_used: experiences.length,
      update_metrics: updateResult,
      promotion_eligible: shouldPromote.promote,
      promotion_reason: shouldPromote.reason,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in online-ppo-update:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function loadExperiences(episodes: any[]): Promise<Experience[]> {
  // Simplified - in production, load from object storage using bucket_uri
  const experiences: Experience[] = [];
  
  for (const episode of episodes) {
    // Mock experience extraction from episode metadata
    if (episode.metadata?.transitions) {
      experiences.push(...episode.metadata.transitions);
    }
  }
  
  return experiences;
}

async function performPPOUpdate(
  model: any,
  experiences: Experience[],
  hyperparams: any
): Promise<any> {
  console.log(`Performing PPO update with ${experiences.length} experiences`);
  
  // Simplified PPO update logic
  // In production, this would:
  // 1. Load current model weights
  // 2. Compute advantages using GAE
  // 3. Run mini-batch gradient updates with clipping
  // 4. Track KL divergence and entropy
  // 5. Apply gradient clipping
  
  // Calculate mock metrics
  const avgReward = experiences.reduce((sum, exp) => sum + exp.reward, 0) / experiences.length;
  
  // Mock KL divergence (in production, compute actual KL between old and new policy)
  const klDivergence = Math.random() * hyperparams.targetKL * 1.5;
  
  // Mock policy entropy
  const entropy = 0.5 + Math.random() * 0.3;
  
  // Mock clip fraction
  const clipFraction = Math.random() * 0.3;
  
  return {
    success: true,
    kl_divergence: klDivergence,
    entropy,
    clip_fraction: clipFraction,
    avg_reward: avgReward,
    learning_rate: hyperparams.learningRate,
    num_updates: 1,
  };
}

async function evaluatePromotion(
  supabase: any,
  asset: string,
  shadowVersion: string
): Promise<{ promote: boolean; reason: string }> {
  // Get shadow metrics
  const { data: shadowMetrics } = await supabase
    .from('model_metrics')
    .select('*')
    .eq('asset', asset)
    .eq('version', shadowVersion)
    .single();

  // Get active model metrics for comparison
  const { data: activeModel } = await supabase
    .from('models')
    .select('version')
    .eq('asset', asset)
    .eq('status', 'active')
    .single();

  if (!activeModel) {
    return { promote: true, reason: 'No active model exists' };
  }

  const { data: activeMetrics } = await supabase
    .from('model_metrics')
    .select('*')
    .eq('asset', asset)
    .eq('version', activeModel.version)
    .single();

  if (!shadowMetrics || !activeMetrics) {
    return { promote: false, reason: 'Insufficient metrics' };
  }

  // Promotion criteria
  const MIN_TRADES = 100;
  const MIN_WIN_RATE_IMPROVEMENT = 0.02; // 2%
  const MIN_SHARPE_IMPROVEMENT = 0.1;
  const MAX_DRAWDOWN_THRESHOLD = 0.15; // 15%

  if (shadowMetrics.total_trades < MIN_TRADES) {
    return { 
      promote: false, 
      reason: `Insufficient trades: ${shadowMetrics.total_trades}/${MIN_TRADES}` 
    };
  }

  // Check for degradation
  if (shadowMetrics.win_rate < activeMetrics.win_rate - 0.05) {
    return { promote: false, reason: 'Win rate degraded' };
  }

  if (shadowMetrics.max_dd > MAX_DRAWDOWN_THRESHOLD) {
    return { promote: false, reason: `Max drawdown too high: ${shadowMetrics.max_dd}` };
  }

  // Check for improvement
  const winRateImprovement = shadowMetrics.win_rate - activeMetrics.win_rate;
  const sharpeImprovement = (shadowMetrics.sharpe || 0) - (activeMetrics.sharpe || 0);

  if (winRateImprovement >= MIN_WIN_RATE_IMPROVEMENT || sharpeImprovement >= MIN_SHARPE_IMPROVEMENT) {
    return { 
      promote: true, 
      reason: `Metrics improved - WR: +${(winRateImprovement * 100).toFixed(2)}%, Sharpe: +${sharpeImprovement.toFixed(2)}` 
    };
  }

  return { promote: false, reason: 'No significant improvement yet' };
}
