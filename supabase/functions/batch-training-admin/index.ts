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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth header for user validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, batchId } = await req.json();

    if (action === 'reset-failed') {
      console.log(`🔄 Resetting failed jobs for batch: ${batchId || 'all'}`);

      // Build query
      let query = supabase
        .from('batch_training_jobs')
        .update({ 
          status: 'queued',
          error_message: null,
          attempt_count: 0,
          started_at: null,
          completed_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('status', 'failed')
        .eq('user_id', user.id);

      // Optionally filter by batch_id
      if (batchId) {
        query = query.eq('batch_id', batchId);
      }

      const { data, error } = await query.select();

      if (error) throw error;

      console.log(`✅ Reset ${data?.length || 0} failed jobs to queued`);

      // Get updated counts
      const { data: stats } = await supabase
        .from('batch_training_jobs')
        .select('status')
        .eq('user_id', user.id);

      const statusCounts = (stats || []).reduce((acc: any, job: any) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {});

      return new Response(
        JSON.stringify({ 
          success: true,
          resetCount: data?.length || 0,
          statusCounts
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get-stats') {
      // Get comprehensive statistics
      const { data: jobs } = await supabase
        .from('batch_training_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      const statusCounts = (jobs || []).reduce((acc: any, job: any) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {});

      const failedJobs = (jobs || []).filter(j => j.status === 'failed');
      const recentFailures = failedJobs.slice(0, 10);

      return new Response(
        JSON.stringify({ 
          success: true,
          statusCounts,
          totalJobs: jobs?.length || 0,
          failedCount: failedJobs.length,
          recentFailures: recentFailures.map(j => ({
            symbol: j.symbol,
            error: j.error_message,
            attempts: j.attempt_count
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete-batch') {
      // Delete all jobs for a batch
      const { error } = await supabase
        .from('batch_training_jobs')
        .delete()
        .eq('batch_id', batchId)
        .eq('user_id', user.id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');

  } catch (error: any) {
    console.error('❌ Admin function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: error.message === 'Unauthorized' ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
