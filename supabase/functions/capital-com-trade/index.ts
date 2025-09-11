import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Capital.com API endpoints
const CAPITAL_API_BASE = 'https://api-capital.backend-capital.com/api/v1';
const CAPITAL_DEMO_API_BASE = 'https://demo-api-capital.backend-capital.com/api/v1';

interface CapitalComCredentials {
  apiKey: string;
  apiSecret: string;
  accountType: 'demo' | 'live';
}

interface TradeRequest {
  symbol: string;
  tradeType: 'BUY' | 'SELL';
  quantity: number;
  currentPrice: number;
  portfolioId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    // Get user from JWT
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { symbol, tradeType, quantity, currentPrice, portfolioId, credentials }: TradeRequest & { credentials?: { apiKey: string; password: string } } = await req.json();

    // Get Capital.com API credentials from request or environment
    const apiCredentials: CapitalComCredentials = credentials ? {
      apiKey: credentials.apiKey,
      apiSecret: credentials.password,
      accountType: (Deno.env.get('CAPITAL_COM_ACCOUNT_TYPE') ?? 'demo') as 'demo' | 'live'
    } : {
      apiKey: Deno.env.get('CAPITAL_COM_API_KEY') ?? '',
      apiSecret: Deno.env.get('CAPITAL_COM_API_SECRET') ?? '',
      accountType: (Deno.env.get('CAPITAL_COM_ACCOUNT_TYPE') ?? 'demo') as 'demo' | 'live'
    };

    if (!apiCredentials.apiKey || !apiCredentials.apiSecret) {
      throw new Error('Capital.com API credentials not configured');
    }

    console.log(`Executing ${tradeType} trade for ${quantity} shares of ${symbol} at $${currentPrice}`);

    // Get authentication token from Capital.com
    const authToken = await getCapitalComAuthToken(apiCredentials);
    
    // Get market info for the symbol
    const marketInfo = await getMarketInfo(symbol, authToken, apiCredentials);
    
    if (!marketInfo) {
      throw new Error(`Market ${symbol} not found or not available for trading`);
    }

    // Execute the trade
    const tradeResult = await executeTrade({
      epic: marketInfo.epic,
      direction: tradeType === 'BUY' ? 'BUY' : 'SELL',
      size: quantity,
      orderType: 'MARKET'
    }, authToken, apiCredentials);

    console.log('Capital.com trade result:', tradeResult);

    // Update the database with the trade result
    if (tradeResult.dealReference) {
      // Save trade to database
      const { error: tradeError } = await supabaseClient
        .from('trades')
        .insert({
          user_id: user.id,
          portfolio_id: portfolioId,
          symbol: symbol,
          trade_type: tradeType,
          quantity: quantity,
          price: currentPrice,
          total_amount: quantity * currentPrice,
          risk_score: 25, // Default risk score for Capital.com trades
          ppo_signal: {
            platform: 'capital.com',
            dealReference: tradeResult.dealReference,
            dealStatus: tradeResult.dealStatus
          }
        });

      if (tradeError) {
        console.error('Error saving trade to database:', tradeError);
      }

      // Update portfolio balance
      const balanceChange = tradeType === 'BUY' ? -(quantity * currentPrice) : (quantity * currentPrice);
      
      const { data: portfolio } = await supabaseClient
        .from('portfolios')
        .select('current_balance, initial_balance')
        .eq('id', portfolioId)
        .single();

      if (portfolio) {
        const newBalance = portfolio.current_balance + balanceChange;
        const newPnL = newBalance - portfolio.initial_balance;

        await supabaseClient
          .from('portfolios')
          .update({ 
            current_balance: newBalance,
            total_pnl: newPnL,
            updated_at: new Date().toISOString()
          })
          .eq('id', portfolioId);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dealReference: tradeResult.dealReference,
      dealStatus: tradeResult.dealStatus,
      message: `${tradeType} order for ${quantity} shares of ${symbol} executed on Capital.com`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in Capital.com trade execution:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to execute trade on Capital.com'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function getCapitalComAuthToken(credentials: CapitalComCredentials): Promise<string> {
  const baseUrl = credentials.accountType === 'demo' ? CAPITAL_DEMO_API_BASE : CAPITAL_API_BASE;
  
  const response = await fetch(`${baseUrl}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SECURITY-TOKEN': credentials.apiKey,
      'CST': credentials.apiSecret
    },
    body: JSON.stringify({
      identifier: credentials.apiKey,
      password: credentials.apiSecret
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Capital.com authentication failed: ${errorText}`);
  }

  const authHeaders = response.headers;
  const cst = authHeaders.get('CST');
  const securityToken = authHeaders.get('X-SECURITY-TOKEN');
  
  if (!cst || !securityToken) {
    throw new Error('Failed to get authentication tokens from Capital.com');
  }

  return `${cst}|${securityToken}`;
}

async function getMarketInfo(symbol: string, authToken: string, credentials: CapitalComCredentials) {
  const [cst, securityToken] = authToken.split('|');
  const baseUrl = credentials.accountType === 'demo' ? CAPITAL_DEMO_API_BASE : CAPITAL_API_BASE;

  // Search for the market by symbol
  const response = await fetch(`${baseUrl}/markets?searchTerm=${symbol}`, {
    method: 'GET',
    headers: {
      'CST': cst,
      'X-SECURITY-TOKEN': securityToken
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get market info for ${symbol}`);
  }

  const data = await response.json();
  
  // Find the exact match or closest match
  if (data.markets && data.markets.length > 0) {
    return data.markets.find((market: any) => 
      market.instrumentName.includes(symbol) || market.epic.includes(symbol)
    ) || data.markets[0];
  }

  return null;
}

async function executeTrade(tradeParams: {
  epic: string;
  direction: 'BUY' | 'SELL';
  size: number;
  orderType: string;
}, authToken: string, credentials: CapitalComCredentials) {
  const [cst, securityToken] = authToken.split('|');
  const baseUrl = credentials.accountType === 'demo' ? CAPITAL_DEMO_API_BASE : CAPITAL_API_BASE;

  const response = await fetch(`${baseUrl}/positions/otc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CST': cst,
      'X-SECURITY-TOKEN': securityToken
    },
    body: JSON.stringify({
      epic: tradeParams.epic,
      expiry: '-',
      direction: tradeParams.direction,
      size: tradeParams.size,
      orderType: tradeParams.orderType,
      timeInForce: 'FILL_OR_KILL',
      guaranteedStop: false,
      trailingStop: false
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Trade execution failed: ${errorData.errorCode || response.statusText}`);
  }

  return await response.json();
}