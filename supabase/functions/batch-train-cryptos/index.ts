import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Symbol validation - fetch supported Bybit symbols
async function fetchBybitSupportedSymbols(): Promise<Set<string>> {
  try {
    const response = await fetch('https://api.bybit.com/v5/market/instruments-info?category=spot&limit=1000');
    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }
    
    const symbols = new Set<string>();
    if (data.result?.list) {
      for (const instrument of data.result.list) {
        if (instrument.status === 'Trading') {
          symbols.add(instrument.symbol);
        }
      }
    }
    
    console.log(`✅ Loaded ${symbols.size} tradeable symbols from Bybit`);
    return symbols;
  } catch (error) {
    console.error('❌ Failed to fetch Bybit symbols:', error);
    return new Set();
  }
}

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

      const { symbols: binanceSymbols } = await symbolsResponse.json();
      console.log(`📊 Fetched ${binanceSymbols.length} USDT trading pairs from Binance`);

      // ✅ VALIDATE SYMBOLS AGAINST BYBIT
      console.log('🔍 Validating symbols against Bybit...');
      const bybitSymbols = await fetchBybitSupportedSymbols();
      
      const validSymbols = binanceSymbols.filter((symbol: string) => bybitSymbols.has(symbol));
      const invalidSymbols = binanceSymbols.filter((symbol: string) => !bybitSymbols.has(symbol));
      
      console.log(`✅ Valid symbols: ${validSymbols.length}`);
      console.log(`❌ Invalid symbols (not on Bybit): ${invalidSymbols.length}`);
      
      if (invalidSymbols.length > 0 && invalidSymbols.length <= 20) {
        console.log(`Skipping: ${invalidSymbols.join(', ')}`);
      } else if (invalidSymbols.length > 20) {
        console.log(`Skipping: ${invalidSymbols.slice(0, 10).join(', ')}... and ${invalidSymbols.length - 10} more`);
      }

      // Limit to maxAssets after validation
      const filteredSymbols = validSymbols.slice(0, maxAssets);
      console.log(`🎯 Will train ${filteredSymbols.length} validated assets`);

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
      const jobs = sortedSymbols.map((symbolData: any, index: number) => {
        // Extract symbol string from object or use as-is if already a string
        const symbolStr = typeof symbolData === 'string' ? symbolData : symbolData.symbol;
        return {
          user_id: user.id,
          batch_id: newBatchId,
          symbol: symbolStr,
          status: (existingSymbols.has(symbolStr) && !forceRetrain) ? 'skipped' : 'queued',
          priority: prioritySymbols.includes(symbolStr) ? 1 : 100,
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

// Background processing removed - now handled by cron job (process-training-queue)
