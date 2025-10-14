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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user authentication using service role client
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`🔐 Authenticated user: ${user.id}`);

    const { 
      action = 'start', 
      batchId, 
      minVolume = 1000000, 
      maxAssets = 431,
      forceRetrain = false 
    } = await req.json();

    // Handle different actions
    if (action === 'start') {
      // Fetch all USDT symbols from Binance
      const symbolsResponse = await fetch(
        `${supabaseUrl}/functions/v1/fetch-binance-symbols`,
        {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          }
        }
      );

      if (!symbolsResponse.ok) {
        throw new Error('Failed to fetch Binance symbols');
      }

      const { symbols } = await symbolsResponse.json();
      console.log(`📊 Fetched ${symbols.length} USDT trading pairs from Binance`);

      // Filter by volume if needed (this would require additional API call)
      const filteredSymbols = symbols.slice(0, maxAssets);
      console.log(`🎯 Will train ${filteredSymbols.length} assets`);

      // Check which assets already have trained models
      const { data: existingModels } = await supabase
        .from('asset_models')
        .select('symbol')
        .eq('user_id', user.id);

      const existingSymbols = new Set(existingModels?.map(m => m.symbol) || []);
      console.log(`✅ Found ${existingSymbols.size} existing models`);

      // Create batch ID
      const newBatchId = crypto.randomUUID();

      // Prioritize assets: BTC, ETH, BNB, SOL first
      const prioritySymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'DOGEUSDT'];
      const sortedSymbols = [
        ...filteredSymbols.filter((s: string) => prioritySymbols.includes(s)),
        ...filteredSymbols.filter((s: string) => !prioritySymbols.includes(s))
      ];

      // Create training jobs
      const jobs = sortedSymbols.map((symbol: string, index: number) => ({
        user_id: user.id,
        batch_id: newBatchId,
        symbol,
        status: (existingSymbols.has(symbol) && !forceRetrain) ? 'skipped' : 'queued',
        priority: prioritySymbols.includes(symbol) ? 1 : 100,
      }));

      const { error: insertError } = await supabase
        .from('batch_training_jobs')
        .insert(jobs);

      if (insertError) {
        throw insertError;
      }

      console.log(`🚀 Created ${jobs.length} training jobs in batch ${newBatchId}`);

      // Start processing the batch (background task)
      processBatch(supabase, user.id, newBatchId, forceRetrain, authHeader).catch(err => {
        console.error('❌ Background batch processing error:', err);
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          batchId: newBatchId,
          totalJobs: jobs.length,
          skipped: jobs.filter(j => j.status === 'skipped').length,
          queued: jobs.filter(j => j.status === 'queued').length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'status') {
      if (!batchId) {
        throw new Error('batchId required for status check');
      }

      const { data: jobs, error: jobsError } = await supabase
        .from('batch_training_jobs')
        .select('*')
        .eq('user_id', user.id)
        .eq('batch_id', batchId)
        .order('priority', { ascending: true });

      if (jobsError) throw jobsError;

      const statusCounts = jobs.reduce((acc: any, job: any) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {});

      return new Response(
        JSON.stringify({ 
          success: true, 
          batchId,
          jobs,
          statusCounts,
          total: jobs.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'cancel') {
      if (!batchId) {
        throw new Error('batchId required for cancel');
      }

      // Update all queued jobs to cancelled
      const { error: updateError } = await supabase
        .from('batch_training_jobs')
        .update({ status: 'failed', error_message: 'Cancelled by user' })
        .eq('user_id', user.id)
        .eq('batch_id', batchId)
        .eq('status', 'queued');

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true, message: 'Batch cancelled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('Error in batch-train-cryptos:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processBatch(
  supabase: any,
  userId: string,
  batchId: string,
  forceRetrain: boolean,
  userAuthHeader: string
) {
  console.log(`🔄 Processing batch ${batchId} for user ${userId}`);

  while (true) {
    // Fetch next queued job
    const { data: nextJob, error: fetchError } = await supabase
      .from('batch_training_jobs')
      .select('*')
      .eq('user_id', userId)
      .eq('batch_id', batchId)
      .eq('status', 'queued')
      .order('priority', { ascending: true })
      .limit(1)
      .single();

    if (fetchError || !nextJob) {
      console.log('✅ Batch processing complete or no more jobs');
      break;
    }

    console.log(`🎯 Training ${nextJob.symbol}...`);

    // Update status to training
    await supabase
      .from('batch_training_jobs')
      .update({ status: 'training', started_at: new Date().toISOString() })
      .eq('id', nextJob.id);

    try {
      // Call train-asset-model function with user authentication
      const { data, error } = await supabase.functions.invoke('train-asset-model', {
        body: { symbol: nextJob.symbol, forceRetrain },
        headers: { 
          Authorization: userAuthHeader 
        }
      });

      if (error) {
        console.error(`❌ Function invocation error for ${nextJob.symbol}:`, error);
        throw error;
      }

      // Update job as completed
      await supabase
        .from('batch_training_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          performance_metrics: data.result?.metrics || {},
          training_data_points: data.result?.dataPoints || 0
        })
        .eq('id', nextJob.id);

      console.log(`✅ ${nextJob.symbol} trained successfully`);

    } catch (error) {
      const errorMessage = error?.message || String(error);
      const errorContext = error?.context ? JSON.stringify(error.context) : '';
      
      console.error(`❌ Failed to train ${nextJob.symbol}:`, {
        message: errorMessage,
        context: errorContext,
        stack: error?.stack
      });

      // Update job as failed with detailed error info
      await supabase
        .from('batch_training_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: `${errorMessage} ${errorContext}`.slice(0, 500),
          attempt_count: nextJob.attempt_count + 1
        })
        .eq('id', nextJob.id);
    }

    // Rate limiting: wait 12 seconds between training jobs
    await new Promise(resolve => setTimeout(resolve, 12000));
  }

  console.log(`🎉 Batch ${batchId} processing finished`);
}
