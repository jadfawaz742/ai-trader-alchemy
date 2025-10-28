import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Get user_id and clearType from request body or from auth token
    const { user_id, clearType = 'queued_only' } = await req.json();
    
    let userId: string;
    
    if (user_id) {
      // Allow service role to specify user_id
      userId = user_id;
    } else {
      // Otherwise require auth token
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'No authorization header or user_id provided' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
      
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      userId = user.id;
    }

    let signalsDeleted = 0;
    let tradesDeleted = 0;

    if (clearType === 'complete') {
      // Delete paper trades FIRST (child records)
      const { error: tradesError, count: tDeleted } = await supabaseClient
        .from('paper_trades')
        .delete({ count: 'exact' })
        .eq('user_id', userId);

      if (tradesError) {
        throw new Error(`Failed to delete paper trades: ${tradesError.message}`);
      }
      tradesDeleted = tDeleted || 0;

      // Delete signals AFTER (parent records)
      const { error: signalsError, count: sDeleted } = await supabaseClient
        .from('signals')
        .delete({ count: 'exact' })
        .eq('user_id', userId);

      if (signalsError) {
        throw new Error(`Failed to delete signals: ${signalsError.message}`);
      }
      signalsDeleted = sDeleted || 0;
    } else {
      // Delete open paper trades FIRST (child records)
      const { error: tradesError, count: tDeleted } = await supabaseClient
        .from('paper_trades')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'open');

      if (tradesError) {
        throw new Error(`Failed to delete paper trades: ${tradesError.message}`);
      }
      tradesDeleted = tDeleted || 0;

      // Delete queued signals AFTER (parent records)
      const { error: signalsError, count: sDeleted } = await supabaseClient
        .from('signals')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'queued');

      if (signalsError) {
        throw new Error(`Failed to delete signals: ${signalsError.message}`);
      }
      signalsDeleted = sDeleted || 0;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully cleared paper trading data (${clearType})`,
        clearType,
        signalsDeleted,
        tradesDeleted,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error clearing paper trading data:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
