import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * PROCESS TRAINING QUEUE - v3.1.0
 * Deployed: 2025-10-16
 * Purpose: Process MULTIPLE batch training jobs from queue in parallel
 * Config: train-asset-model has verify_jwt=false to accept service role calls
 * Batch Size: 5 jobs per execution for faster processing
 * Update: Force redeploy for 25-feature extraction fix
 */

const FEATURE_FIX_VERSION = '3.1.0';
console.log(`🔧 process-training-queue v${FEATURE_FIX_VERSION} - 25-feature extraction enabled`);

const BATCH_SIZE = 5; // Process 5 jobs in parallel

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('═══════════════════════════════════════════════════');
  console.log(`🚀 PROCESS TRAINING QUEUE v3.0.0 - STARTED (Batch: ${BATCH_SIZE})`);
  console.log('═══════════════════════════════════════════════════');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('🔧 Environment:', {
      supabaseUrl: supabaseUrl.substring(0, 30) + '...',
      hasServiceKey: !!supabaseServiceKey,
      serviceKeyPrefix: supabaseServiceKey?.substring(0, 20) + '...'
    });
    
    // Use service role client to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log('✅ Supabase client initialized with service role key');
    console.log(`🔄 Checking for queued training jobs (batch size: ${BATCH_SIZE})...`);

    // Fetch multiple queued jobs (ordered by priority, then created_at)
    const { data: jobs, error: fetchError } = await supabase
      .from('batch_training_jobs')
      .select('*')
      .eq('status', 'queued')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      throw fetchError;
    }

    if (!jobs || jobs.length === 0) {
      console.log('✅ No queued jobs found');
      return new Response(JSON.stringify({ message: 'No queued jobs' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📋 Found ${jobs.length} jobs to process:`, jobs.map(j => j.symbol).join(', '));

    // Update all jobs to 'training' status
    const jobIds = jobs.map(j => j.id);
    const { error: updateError } = await supabase
      .from('batch_training_jobs')
      .update({ 
        status: 'training',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .in('id', jobIds);

    if (updateError) {
      console.error('❌ Failed to update job statuses:', updateError);
      throw updateError;
    }

    // Process all jobs in parallel
    const results = await Promise.all(
      jobs.map(async (job) => {
        try {
          console.log(`🎯 Training ${job.symbol} for user ${job.user_id}...`);
          
          const functionUrl = `${supabaseUrl}/functions/v1/train-asset-model`;
          const requestBody = {
            symbol: job.symbol,
            forceRetrain: true, // Always retrain for queue-based jobs
            user_id: job.user_id,
            service_role: true,
            curriculum_stage: job.curriculum_stage || 'full',
            use_augmentation: job.use_augmentation || false
          };
          
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const trainingResult = await response.json();
          
          // Log validation status
          const validationStatus = trainingResult.validation_triggered 
            ? (trainingResult.validation_approved ? '✓ VALIDATED' : '✗ NOT APPROVED')
            : '⚠ NO VALIDATION';
          
          console.log(`✅ Training completed for ${job.symbol} [${validationStatus}]`);

          // Update job as completed
          await supabase
            .from('batch_training_jobs')
            .update({ 
              status: 'completed',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              training_data_points: trainingResult?.dataPoints || null,
              performance_metrics: trainingResult?.metrics || null
            })
            .eq('id', job.id);

          return { success: true, symbol: job.symbol };

        } catch (trainError: any) {
          console.error(`❌ Training failed for ${job.symbol}:`, trainError.message);
          
          const errorMessage = trainError.message || 'Training failed';
          const dataPoints = parseInt(errorMessage.match(/got (\d+)/)?.[1] || '0');
          
          // Check if this is a retryable insufficient data error (30-200 bars)
          if (errorMessage.includes('Insufficient data') && dataPoints >= 30 && dataPoints < 200) {
            console.log(`🔄 Retrying ${job.symbol} with data augmentation (${dataPoints} bars)`);
            
            // Update job to retry with appropriate curriculum and augmentation
            const curriculum = dataPoints < 50 ? 'basic' : dataPoints < 100 ? 'basic' : 'with_sr';
            
            await supabase
              .from('batch_training_jobs')
              .update({
                status: 'queued',
                priority: 200, // Lower priority for retries
                error_message: null,
                curriculum_stage: curriculum,
                use_augmentation: true,
                attempt_count: (job.attempt_count || 0) + 1,
                updated_at: new Date().toISOString()
              })
              .eq('id', job.id);
            
            return { success: false, symbol: job.symbol, error: 'retrying_with_augmentation' };
          }
          
          // Check if this is a permanent failure
          const isPermanentFailure = 
            errorMessage.includes('Not supported symbols') ||
            errorMessage.includes('symbol not supported') ||
            errorMessage.includes('Invalid symbol') ||
            errorMessage.includes('not found on Bybit') ||
            (errorMessage.includes('Insufficient data') && dataPoints < 30);
          
          if (isPermanentFailure) {
            await supabase
              .from('batch_training_jobs')
              .update({ 
                status: 'failed',
                error_message: `[PERMANENT] ${errorMessage}`,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                attempt_count: 999
              })
              .eq('id', job.id);
            
            return { success: false, symbol: job.symbol, error: 'permanent_failure' };
          } else {
            // Handle retry logic
            const newAttemptCount = (job.attempt_count || 0) + 1;
            const maxAttempts = 3;

            if (newAttemptCount >= maxAttempts) {
              await supabase
                .from('batch_training_jobs')
                .update({ 
                  status: 'failed',
                  error_message: errorMessage,
                  updated_at: new Date().toISOString(),
                  completed_at: new Date().toISOString(),
                  attempt_count: newAttemptCount
                })
                .eq('id', job.id);
              
              return { success: false, symbol: job.symbol, error: 'max_attempts' };
            } else {
              await supabase
                .from('batch_training_jobs')
                .update({ 
                  status: 'queued',
                  error_message: `Attempt ${newAttemptCount} failed: ${errorMessage}`,
                  updated_at: new Date().toISOString(),
                  attempt_count: newAttemptCount,
                  started_at: null
                })
                .eq('id', job.id);
              
              return { success: false, symbol: job.symbol, error: 'retrying', attempt: newAttemptCount };
            }
          }
        }
      })
    );

    // Count successes and failures
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    // Check remaining jobs in the first batch
    const { count } = await supabase
      .from('batch_training_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('batch_id', jobs[0].batch_id)
      .eq('status', 'queued');

    const elapsedTime = Date.now() - startTime;
    console.log('═══════════════════════════════════════════════════');
    console.log(`✅ BATCH COMPLETED: ${successful} succeeded, ${failed} failed`);
    console.log(`📊 Remaining jobs in batch: ${count}`);
    console.log(`⏱️  Elapsed time: ${elapsedTime}ms`);
    console.log('═══════════════════════════════════════════════════');

    return new Response(
      JSON.stringify({ 
        success: true,
        processed: jobs.length,
        successful,
        failed,
        remaining: count,
        elapsedMs: elapsedTime,
        version: '3.0.0',
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

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
