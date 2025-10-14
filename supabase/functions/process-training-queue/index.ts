import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role client to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔄 Checking for queued training jobs...');

    // Fetch the next queued job (ordered by priority, then created_at)
    const { data: nextJob, error: fetchError } = await supabase
      .from('batch_training_jobs')
      .select('*')
      .eq('status', 'queued')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        console.log('✅ No queued jobs found');
        return new Response(JSON.stringify({ message: 'No queued jobs' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

    console.log(`📋 Found job: ${nextJob.symbol} (batch: ${nextJob.batch_id})`);

    // Update job status to 'training'
    const { error: updateError } = await supabase
      .from('batch_training_jobs')
      .update({ 
        status: 'training',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', nextJob.id);

    if (updateError) {
      console.error('❌ Failed to update job status:', updateError);
      throw updateError;
    }

    try {
      console.log(`🎯 Training ${nextJob.symbol}...`);
      
      // Call train-asset-model function with service role auth
      const response = await fetch(
        `${supabaseUrl}/functions/v1/train-asset-model`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            symbol: nextJob.symbol, 
            forceRetrain: false,
            user_id: nextJob.user_id // Pass user_id for model ownership
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ HTTP ${response.status} for ${nextJob.symbol}:`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ Training completed for ${nextJob.symbol}`);

      // Update job as completed
      await supabase
        .from('batch_training_jobs')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          training_data_points: data.dataPoints || null,
          performance_metrics: data.metrics || null
        })
        .eq('id', nextJob.id);

      // Check remaining jobs
      const { count } = await supabase
        .from('batch_training_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', nextJob.batch_id)
        .eq('status', 'queued');

      console.log(`📊 Remaining jobs in batch: ${count}`);

      return new Response(
        JSON.stringify({ 
          success: true,
          symbol: nextJob.symbol,
          remaining: count
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (trainError: any) {
      console.error(`❌ Training failed for ${nextJob.symbol}:`, trainError.message);
      
      // Increment attempt count
      const newAttemptCount = (nextJob.attempt_count || 0) + 1;
      const maxAttempts = 3;

      if (newAttemptCount >= maxAttempts) {
        // Mark as failed after max attempts
        await supabase
          .from('batch_training_jobs')
          .update({ 
            status: 'failed',
            error_message: trainError.message,
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            attempt_count: newAttemptCount
          })
          .eq('id', nextJob.id);
        
        console.log(`❌ Job failed after ${maxAttempts} attempts: ${nextJob.symbol}`);
      } else {
        // Requeue for retry
        await supabase
          .from('batch_training_jobs')
          .update({ 
            status: 'queued',
            error_message: `Attempt ${newAttemptCount} failed: ${trainError.message}`,
            updated_at: new Date().toISOString(),
            attempt_count: newAttemptCount,
            started_at: null // Reset started_at for retry
          })
          .eq('id', nextJob.id);
        
        console.log(`🔄 Job requeued for retry (attempt ${newAttemptCount + 1}/${maxAttempts}): ${nextJob.symbol}`);
      }

      return new Response(
        JSON.stringify({ 
          success: false,
          error: trainError.message,
          symbol: nextJob.symbol,
          attempt: newAttemptCount
        }),
        { 
          status: 200, // Still return 200 so cron doesn't retry
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error: any) {
    console.error('❌ Queue processor error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
