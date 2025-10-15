import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, symbols, period, riskLevel, batchId } = await req.json();

    console.log(`📊 Batch Backtest Action: ${action}`, { user: user.id, symbols, period, riskLevel });

    // Handle different actions
    if (action === 'start') {
      // Validate input
      if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        throw new Error('Symbols array is required');
      }
      if (!period) {
        throw new Error('Period is required');
      }
      if (!riskLevel) {
        throw new Error('Risk level is required');
      }

      const newBatchId = crypto.randomUUID();

      // Create backtest run record
      const { data: backtestRun, error: runError } = await supabase
        .from('backtest_runs')
        .insert({
          user_id: user.id,
          batch_id: newBatchId,
          symbols,
          period,
          risk_level: riskLevel,
          status: 'queued',
          total_symbols: symbols.length,
          completed_symbols: 0,
          failed_symbols: 0
        })
        .select()
        .single();

      if (runError) {
        console.error('Error creating backtest run:', runError);
        throw new Error(`Failed to create backtest run: ${runError.message}`);
      }

      console.log('✅ Created backtest run:', backtestRun.id);

      // Create individual backtest jobs for each symbol
      const jobs = symbols.map((symbol: string, index: number) => ({
        user_id: user.id,
        batch_id: newBatchId,
        backtest_run_id: backtestRun.id,
        symbol,
        period,
        risk_level: riskLevel,
        status: 'queued',
        priority: 100 - index // Higher priority for first symbols
      }));

      const { error: jobsError } = await supabase
        .from('backtest_jobs')
        .insert(jobs);

      if (jobsError) {
        console.error('Error creating backtest jobs:', jobsError);
        throw new Error(`Failed to create backtest jobs: ${jobsError.message}`);
      }

      console.log(`✅ Created ${jobs.length} backtest jobs`);

      // Trigger the processing function
      try {
        await supabase.functions.invoke('process-backtest-queue', {
          body: { trigger: 'batch-start' }
        });
        console.log('✅ Triggered process-backtest-queue');
      } catch (error) {
        console.error('⚠️ Failed to trigger queue processing:', error);
        // Non-fatal - queue will be processed on next cron run
      }

      return new Response(
        JSON.stringify({
          success: true,
          batchId: newBatchId,
          backtestRunId: backtestRun.id,
          totalJobs: jobs.length,
          message: `Started backtest for ${symbols.length} symbols`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'status') {
      if (!batchId) {
        throw new Error('Batch ID is required for status check');
      }

      // Get backtest run status
      const { data: backtestRun, error: runError } = await supabase
        .from('backtest_runs')
        .select('*')
        .eq('batch_id', batchId)
        .eq('user_id', user.id)
        .single();

      if (runError || !backtestRun) {
        throw new Error('Backtest run not found');
      }

      // Get job statuses
      const { data: jobs, error: jobsError } = await supabase
        .from('backtest_jobs')
        .select('*')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: true });

      if (jobsError) {
        throw new Error(`Failed to get jobs: ${jobsError.message}`);
      }

      // Calculate progress
      const queued = jobs.filter(j => j.status === 'queued').length;
      const running = jobs.filter(j => j.status === 'running').length;
      const completed = jobs.filter(j => j.status === 'completed').length;
      const failed = jobs.filter(j => j.status === 'failed').length;

      return new Response(
        JSON.stringify({
          success: true,
          backtestRun,
          jobs: jobs.map(j => ({
            id: j.id,
            symbol: j.symbol,
            status: j.status,
            error: j.error_message,
            results: j.results
          })),
          progress: {
            total: jobs.length,
            queued,
            running,
            completed,
            failed,
            percentage: Math.round((completed / jobs.length) * 100)
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'cancel') {
      if (!batchId) {
        throw new Error('Batch ID is required for cancellation');
      }

      // Update all queued jobs to failed
      const { error: updateError } = await supabase
        .from('backtest_jobs')
        .update({ 
          status: 'failed',
          error_message: 'Cancelled by user',
          completed_at: new Date().toISOString()
        })
        .eq('batch_id', batchId)
        .eq('user_id', user.id)
        .eq('status', 'queued');

      if (updateError) {
        throw new Error(`Failed to cancel jobs: ${updateError.message}`);
      }

      // Update backtest run status
      const { error: runError } = await supabase
        .from('backtest_runs')
        .update({ 
          status: 'cancelled',
          completed_at: new Date().toISOString()
        })
        .eq('batch_id', batchId)
        .eq('user_id', user.id);

      if (runError) {
        throw new Error(`Failed to cancel backtest run: ${runError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Backtest cancelled successfully'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: any) {
    console.error('Batch backtest error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
