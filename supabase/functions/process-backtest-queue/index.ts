import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 3; // Process 3 symbols in parallel to avoid timeouts

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('═══════════════════════════════════════════════════');
    console.log('🚀 PROCESS BACKTEST QUEUE - STARTED');
    console.log('═══════════════════════════════════════════════════');

    // Fetch queued jobs
    const { data: jobs, error: fetchError } = await supabase
      .from('backtest_jobs')
      .select('*')
      .eq('status', 'queued')
      .order('priority', { ascending: false })
      .limit(BATCH_SIZE);

    if (fetchError) {
      throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      console.log('📋 No queued backtest jobs found');
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No jobs to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${jobs.length} jobs to process:`, jobs.map(j => j.symbol).join(', '));

    // Update jobs to running status
    const jobIds = jobs.map(j => j.id);
    const { error: updateError } = await supabase
      .from('backtest_jobs')
      .update({ 
        status: 'running',
        started_at: new Date().toISOString(),
        attempt_count: jobs[0].attempt_count + 1
      })
      .in('id', jobIds);

    if (updateError) {
      console.error('Failed to update job status:', updateError);
    }

    // Process jobs in parallel
    const results = await Promise.allSettled(
      jobs.map(async (job) => {
        console.log(`🎯 Processing backtest for ${job.symbol}...`);
        
        try {
          // Call the advanced-trading-bot function for single symbol
          const response = await fetch(`${supabaseUrl}/functions/v1/advanced-trading-bot`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              mode: 'scan',
              symbols: [job.symbol],
              risk: job.risk_level,
              portfolioBalance: 100000,
              tradingFrequency: 'aggressive',
              maxDailyTrades: 20,
              enableShorts: false,
              backtestMode: true,
              backtestPeriod: job.period
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Backtest failed: ${response.status} ${errorText}`);
          }

          const result = await response.json();
          
          // Store trades in backtest_trades table
          if (result.backtestResults && result.backtestResults.trades) {
            const trades = result.backtestResults.trades.map((trade: any) => ({
              backtest_run_id: job.backtest_run_id,
              symbol: job.symbol,
              timestamp: trade.timestamp || new Date().toISOString(),
              action: trade.action,
              price: trade.entryPrice || trade.price,
              quantity: trade.quantity || 1,
              confidence: trade.confidence || 0,
              indicators: trade.indicators,
              pnl: trade.pnl,
              exit_price: trade.exitPrice,
              exit_timestamp: trade.exitDate,
              duration_minutes: trade.duration,
              outcome: trade.outcome
            }));

            if (trades.length > 0) {
              const { error: tradesError } = await supabase
                .from('backtest_trades')
                .insert(trades);
              
              if (tradesError) {
                console.error(`Failed to store trades for ${job.symbol}:`, tradesError);
              } else {
                console.log(`✅ Stored ${trades.length} trades for ${job.symbol}`);
              }
            }
          }

          // Update job as completed
          await supabase
            .from('backtest_jobs')
            .update({
              status: 'completed',
              results: result.backtestResults,
              completed_at: new Date().toISOString()
            })
            .eq('id', job.id);

          // Update backtest run progress
          await supabase.rpc('increment', {
            table_name: 'backtest_runs',
            row_id: job.backtest_run_id,
            column_name: 'completed_symbols'
          }).catch(() => {
            // Fallback: manual increment
            supabase
              .from('backtest_runs')
              .select('completed_symbols')
              .eq('id', job.backtest_run_id)
              .single()
              .then(({ data }) => {
                if (data) {
                  supabase
                    .from('backtest_runs')
                    .update({ completed_symbols: data.completed_symbols + 1 })
                    .eq('id', job.backtest_run_id);
                }
              });
          });

          console.log(`✅ Backtest completed for ${job.symbol}`);
          return { success: true, symbol: job.symbol };
        } catch (error: any) {
          console.error(`❌ Backtest failed for ${job.symbol}:`, error.message);
          
          // Update job as failed
          await supabase
            .from('backtest_jobs')
            .update({
              status: 'failed',
              error_message: error.message,
              completed_at: new Date().toISOString()
            })
            .eq('id', job.id);

          // Update backtest run failed count
          await supabase.rpc('increment', {
            table_name: 'backtest_runs',
            row_id: job.backtest_run_id,
            column_name: 'failed_symbols'
          }).catch(() => {
            // Fallback: manual increment
            supabase
              .from('backtest_runs')
              .select('failed_symbols')
              .eq('id', job.backtest_run_id)
              .single()
              .then(({ data }) => {
                if (data) {
                  supabase
                    .from('backtest_runs')
                    .update({ failed_symbols: data.failed_symbols + 1 })
                    .eq('id', job.backtest_run_id);
                }
              });
          });

          return { success: false, symbol: job.symbol, error: error.message };
        }
      })
    );

    // Count successes and failures
    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

    const elapsedTime = Date.now() - startTime;

    console.log('═══════════════════════════════════════════════════');
    console.log(`✅ BATCH COMPLETED: ${succeeded} succeeded, ${failed} failed`);
    console.log(`⏱️  Elapsed time: ${elapsedTime}ms`);
    console.log('═══════════════════════════════════════════════════');

    // Check if there are more jobs to process
    const { count: remainingCount } = await supabase
      .from('backtest_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued');

    return new Response(
      JSON.stringify({
        success: true,
        processed: jobs.length,
        succeeded,
        failed,
        remainingJobs: remainingCount || 0,
        elapsedTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Process backtest queue error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
