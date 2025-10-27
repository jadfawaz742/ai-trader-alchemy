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

    // Get user_id from request body or from auth token
    const { user_id } = await req.json();
    
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

    // Delete queued signals
    const { error: signalsError, count: signalsDeleted } = await supabaseClient
      .from('signals')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'queued');

    if (signalsError) {
      throw new Error(`Failed to delete signals: ${signalsError.message}`);
    }

    // Delete open paper trades
    const { error: tradesError, count: tradesDeleted } = await supabaseClient
      .from('paper_trades')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'open');

    if (tradesError) {
      throw new Error(`Failed to delete paper trades: ${tradesError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Successfully cleared paper trading data',
        signalsDeleted: signalsDeleted || 0,
        tradesDeleted: tradesDeleted || 0,
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
