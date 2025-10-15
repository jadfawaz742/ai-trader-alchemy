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

    // Verify user authentication
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`🔐 Authenticated user: ${user.id}`);

    const { 
      action = 'start',
      assetType = 'crypto', // 'crypto' | 'stock' | 'both'
      batchId,
      minVolume = 1000000,
      cryptoMaxAssets = 431,
      stockSymbols = [], // User-provided stock list
      forceRetrain = false
    } = await req.json();

    // Handle different actions
    if (action === 'start') {
      let symbols: string[] = [];
      
      // Fetch crypto symbols if requested
      if (assetType === 'crypto' || assetType === 'both') {
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

        const { symbols: binanceSymbols } = await symbolsResponse.json();
        console.log(`📊 Fetched ${binanceSymbols.length} USDT trading pairs from Binance`);

        // Limit to cryptoMaxAssets
        const filteredCrypto = binanceSymbols.slice(0, cryptoMaxAssets);
        symbols.push(...filteredCrypto.map((s: any) => typeof s === 'string' ? s : s.symbol));
        console.log(`🎯 Added ${filteredCrypto.length} crypto assets`);
      }
      
      // Add stock symbols if requested
      if (assetType === 'stock' || assetType === 'both') {
        if (stockSymbols.length > 0) {
          symbols.push(...stockSymbols);
          console.log(`📈 Added ${stockSymbols.length} stock symbols`);
        } else if (assetType === 'stock') {
          throw new Error('No stock symbols provided. Please provide stockSymbols array.');
        }
      }

      console.log(`🎯 Will train ${symbols.length} total assets (${assetType})`);

      // Check which assets already have trained models
      const { data: existingModels } = await supabase
        .from('asset_models')
        .select('symbol')
        .eq('user_id', user.id);

      const existingSymbols = new Set(existingModels?.map(m => m.symbol) || []);
      console.log(`✅ Found ${existingSymbols.size} existing models`);

      // Create batch ID
      const newBatchId = crypto.randomUUID();

      // Prioritize major assets
      const prioritySymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'DOGEUSDT', 'AAPL', 'MSFT', 'GOOGL', 'TSLA'];
      const sortedSymbols = [
        ...symbols.filter((s: string) => prioritySymbols.includes(s)),
        ...symbols.filter((s: string) => !prioritySymbols.includes(s))
      ];

      // Create training jobs with curriculum stage determination
      const jobs = sortedSymbols.map((symbolStr: string, index: number) => {
        return {
          user_id: user.id,
          batch_id: newBatchId,
          symbol: symbolStr,
          status: (existingSymbols.has(symbolStr) && !forceRetrain) ? 'skipped' : 'queued',
          priority: prioritySymbols.includes(symbolStr) ? 1 : 100,
          curriculum_stage: 'full', // Will be auto-adjusted based on data availability
          use_augmentation: false // Will be enabled on retry if needed
        };
      });

      const { error: insertError } = await supabase
        .from('batch_training_jobs')
        .insert(jobs);

      if (insertError) {
        throw insertError;
      }

      console.log(`🚀 Created ${jobs.length} training jobs in batch ${newBatchId}`);
      console.log('📋 Jobs queued for cron processing (process-training-queue)');

      return new Response(
        JSON.stringify({ 
          success: true,
          batchId: newBatchId,
          totalJobs: jobs.length,
          skipped: jobs.filter(j => j.status === 'skipped').length,
          queued: jobs.filter(j => j.status === 'queued').length,
          assetType,
          cryptoAssets: assetType === 'crypto' || assetType === 'both' ? symbols.filter(s => s.includes('USDT')).length : 0,
          stockAssets: assetType === 'stock' || assetType === 'both' ? stockSymbols.length : 0
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
      
      // Curriculum stage distribution
      const curriculumDistribution = jobs.reduce((acc: any, job: any) => {
        if (job.curriculum_stage) {
          acc[job.curriculum_stage] = (acc[job.curriculum_stage] || 0) + 1;
        }
        return acc;
      }, {});

      return new Response(
        JSON.stringify({ 
          success: true,
          batchId,
          jobs,
          statusCounts,
          curriculumDistribution,
          total: jobs.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'cancel') {
      if (!batchId) {
        throw new Error('batchId required for cancel');
      }

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
    console.error('Error in batch-train-assets:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
