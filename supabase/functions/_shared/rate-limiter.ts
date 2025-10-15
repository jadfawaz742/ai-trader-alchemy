// Rate limiting implementation using sliding window algorithm
// Phase 3: Rate Limiting Implementation

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface RateLimitConfig {
  endpoint: string;
  limit: number;
  windowMinutes?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  remaining?: number;
}

/**
 * Check if a request should be allowed based on rate limiting rules
 * Uses a sliding window algorithm with IP-based tracking
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  config: RateLimitConfig,
  userId: string | null,
  ipAddress: string
): Promise<RateLimitResult> {
  const { endpoint, limit, windowMinutes = 1 } = config;
  
  try {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    
    // Check existing requests in the current window
    const { data: existingLogs, error: fetchError } = await supabase
      .from('rate_limit_log')
      .select('request_count, window_start')
      .eq('endpoint', endpoint)
      .eq('ip_address', ipAddress)
      .gte('window_start', windowStart.toISOString())
      .order('window_start', { ascending: false });
    
    if (fetchError) {
      console.error('❌ Error fetching rate limit logs:', fetchError);
      // On error, allow the request but log the issue
      return { allowed: true };
    }
    
    // Calculate total requests in window
    const totalRequests = existingLogs?.reduce((sum, log) => sum + log.request_count, 0) || 0;
    
    if (totalRequests >= limit) {
      // Calculate retry-after time
      const oldestLog = existingLogs?.[existingLogs.length - 1];
      const oldestLogTime = oldestLog ? new Date(oldestLog.window_start).getTime() : Date.now();
      const retryAfter = Math.ceil((oldestLogTime + windowMinutes * 60 * 1000 - Date.now()) / 1000);
      
      console.warn(`⚠️ Rate limit exceeded for ${endpoint} from IP ${ipAddress}`);
      
      return { 
        allowed: false, 
        retryAfter: Math.max(1, retryAfter),
        remaining: 0
      };
    }
    
    // Log this request
    const { error: insertError } = await supabase
      .from('rate_limit_log')
      .insert({
        endpoint,
        user_id: userId,
        ip_address: ipAddress,
        request_count: 1,
        window_start: new Date().toISOString()
      });
    
    if (insertError) {
      console.error('❌ Error inserting rate limit log:', insertError);
      // On error, allow the request but log the issue
      return { allowed: true };
    }
    
    return { 
      allowed: true,
      remaining: limit - totalRequests - 1
    };
    
  } catch (error) {
    console.error('❌ Rate limiter error:', error);
    // On unexpected error, fail open (allow request) to prevent service disruption
    return { allowed: true };
  }
}

/**
 * Extract IP address from request headers
 */
export function getClientIp(req: Request): string {
  // Check common headers for IP address (Cloudflare, AWS, etc.)
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');
  const xRealIp = req.headers.get('x-real-ip');
  
  if (cfConnectingIp) return cfConnectingIp;
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  if (xRealIp) return xRealIp;
  
  return 'unknown';
}

/**
 * Create a rate limit exceeded response
 */
export function createRateLimitResponse(
  result: RateLimitResult,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ 
      error: 'Rate limit exceeded',
      message: `Too many requests. Please try again in ${result.retryAfter} seconds.`,
      retryAfter: result.retryAfter
    }),
    { 
      status: 429,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfter || 60),
        'X-RateLimit-Remaining': String(result.remaining || 0)
      } 
    }
  );
}

/**
 * Add rate limit headers to a successful response
 */
export function addRateLimitHeaders(
  response: Response,
  result: RateLimitResult
): Response {
  if (result.remaining !== undefined) {
    const headers = new Headers(response.headers);
    headers.set('X-RateLimit-Remaining', String(result.remaining));
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  
  return response;
}