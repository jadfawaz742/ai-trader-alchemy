// Version 2.0 - VPS Proxy with Domain - Forced Redeploy
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BinanceAccountInfo {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  accountType: string;
  balances: Array<{
    asset: string;
    free: string;
    locked: string;
  }>;
  permissions: string[];
}

function generateSignature(queryString: string, apiSecret: string): string {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(queryString);
  
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ).then(key => 
    crypto.subtle.sign('HMAC', key, messageData)
  ).then(signature => {
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Testing Binance connection...');
    
    // Debug: Log available environment variable names (not values)
    const envVars = Object.keys(Deno.env.toObject());
    console.log('📋 Available env vars:', envVars.filter(k => k.includes('BINANCE')).join(', '));

    // Load API credentials and proxy URL from environment
    const apiKey = Deno.env.get('BINANCE_API_KEY');
    const apiSecret = Deno.env.get('BINANCE_API_SECRET');
    const vpsProxyUrl = Deno.env.get('VPS_PROXY_URL');

    // Detailed error reporting
    const missingSecrets = [];
    if (!apiKey) missingSecrets.push('BINANCE_API_KEY');
    if (!apiSecret) missingSecrets.push('BINANCE_API_SECRET');

    if (missingSecrets.length > 0) {
      console.error('❌ Missing API credentials:', missingSecrets.join(', '));
      return new Response(
        JSON.stringify({
          success: false,
          error: 'API credentials not configured',
          missing: missingSecrets,
          details: `Please ensure ${missingSecrets.join(' and ')} are set in Supabase Edge Function secrets`,
          availableEnvVars: envVars.filter(k => k.includes('BINANCE')),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('✅ API key found:', apiKey.substring(0, 8) + '...');
    console.log('✅ API secret found:', apiSecret.substring(0, 4) + '...');

    // Check if VPS proxy is configured
    const usingProxy = !!vpsProxyUrl;
    if (usingProxy) {
      console.log('🌐 Using VPS proxy:', vpsProxyUrl);
    } else {
      console.log('⚠️ No VPS proxy configured, using direct connection');
    }

    // Generate signature for authenticated request
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await generateSignature(queryString, apiSecret);

    console.log('🔐 Signature generated');

    // Call Binance API - through proxy if available
    const binanceEndpoint = `/api/v3/account?${queryString}&signature=${signature}`;
    const targetUrl = usingProxy 
      ? `${vpsProxyUrl}${binanceEndpoint}`
      : `https://api.binance.com${binanceEndpoint}`;
    
    console.log('📡 Calling:', targetUrl.substring(0, 50) + '...');

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
        ...(usingProxy ? { 'X-Target-Host': 'api.binance.com' } : {}),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Binance API error:', data);
      return new Response(
        JSON.stringify({
          success: false,
          error: data.msg || 'Binance API error',
          code: data.code,
          details: getTroubleshootingHint(data.code),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status }
      );
    }

    const accountInfo = data as BinanceAccountInfo;
    console.log('✅ Connection successful!');

    // Filter balances to show only non-zero amounts
    const nonZeroBalances = accountInfo.balances
      .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map(b => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked),
      }))
      .sort((a, b) => b.total - a.total);

    return new Response(
      JSON.stringify({
        success: true,
        connection: {
          status: 'Connected',
          accountType: accountInfo.accountType,
          canTrade: accountInfo.canTrade,
          canWithdraw: accountInfo.canWithdraw,
          canDeposit: accountInfo.canDeposit,
          permissions: accountInfo.permissions,
        },
        balances: nonZeroBalances,
        fees: {
          maker: accountInfo.makerCommission / 10000, // Convert to percentage
          taker: accountInfo.takerCommission / 10000,
        },
        proxy: {
          enabled: usingProxy,
          url: usingProxy ? vpsProxyUrl : null,
        },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error testing Binance connection:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: 'An unexpected error occurred while testing the connection',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function getTroubleshootingHint(code: number): string {
  const hints: Record<number, string> = {
    '-2014': 'API key is invalid. Please verify you copied the correct API key from Binance.',
    '-2015': 'Invalid API signature. Please verify you copied the correct API secret (not the API key).',
    '-1022': 'Signature verification failed. Make sure your API secret is correct.',
    '-2008': 'Invalid API key format. Please check your API key.',
    '-1021': 'Timestamp out of sync. This is a server time synchronization issue.',
    '-2010': 'Insufficient account balance for the requested operation.',
  };

  return hints[code] || 'Please check your API credentials and permissions in Binance.';
}
