// Validation schemas using Zod for input validation across edge functions
// Phase 2: Input Validation Implementation

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// ==================== BROKER VALIDATION ====================

export const BrokerCredentialsSchema = z.object({
  broker_id: z.string().uuid('Invalid broker ID format'),
  auth_type: z.enum(['api_key', 'oauth'], {
    errorMap: () => ({ message: 'Auth type must be either api_key or oauth' })
  }),
  credentials: z.object({
    api_key: z.string()
      .min(10, 'API key must be at least 10 characters')
      .max(256, 'API key must be less than 256 characters')
      .regex(/^[A-Za-z0-9\-_]+$/, 'API key contains invalid characters'),
    api_secret: z.string()
      .min(10, 'API secret must be at least 10 characters')
      .max(256, 'API secret must be less than 256 characters')
      .regex(/^[A-Za-z0-9\-_]+$/, 'API secret contains invalid characters'),
    account_type: z.enum(['live', 'paper']).optional()
  }),
  action: z.enum(['validate', 'disconnect'], {
    errorMap: () => ({ message: 'Action must be either validate or disconnect' })
  })
});

// ==================== SIGNAL VALIDATION ====================

export const SignalExecutionSchema = z.object({
  signal_id: z.string().uuid('Invalid signal ID format')
});

export const SignalDataSchema = z.object({
  asset: z.string()
    .min(2, 'Asset symbol must be at least 2 characters')
    .max(20, 'Asset symbol must be less than 20 characters')
    .regex(/^[A-Z0-9]+$/, 'Asset symbol must contain only uppercase letters and numbers')
    .transform(val => val.toUpperCase()),
  qty: z.number()
    .positive('Quantity must be positive')
    .max(1000000, 'Quantity exceeds maximum allowed'),
  side: z.enum(['BUY', 'SELL'], {
    errorMap: () => ({ message: 'Side must be either BUY or SELL' })
  }),
  broker_id: z.string().uuid('Invalid broker ID format'),
  order_type: z.enum(['MARKET', 'LIMIT']).optional(),
  limit_price: z.number().positive().optional(),
  sl: z.number().positive().optional(),
  tp: z.number().positive().optional()
});

// ==================== TRAINING VALIDATION ====================

export const TrainingRequestSchema = z.object({
  symbol: z.string()
    .min(2, 'Symbol must be at least 2 characters')
    .max(20, 'Symbol must be less than 20 characters')
    .regex(/^[A-Z0-9\-]+$/, 'Symbol must contain only uppercase letters, numbers, and hyphens')
    .transform(val => val.trim().toUpperCase()),
  forceRetrain: z.boolean().optional().default(false),
  user_id: z.string().uuid('Invalid user ID format').optional()
});

// ==================== STOCK DATA VALIDATION ====================

export const StockPriceRequestSchema = z.object({
  symbol: z.string()
    .min(1, 'Symbol is required')
    .max(12, 'Symbol must be less than 12 characters')
    .regex(/^[A-Z0-9\.\-]+$/, 'Symbol contains invalid characters')
    .transform(val => val.trim().toUpperCase())
});

export const StockHistoryRequestSchema = z.object({
  symbol: z.string()
    .min(1, 'Symbol is required')
    .max(12, 'Symbol must be less than 12 characters')
    .regex(/^[A-Z0-9\.\-]+$/, 'Symbol contains invalid characters')
    .transform(val => val.trim().toUpperCase()),
  range: z.enum(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'])
    .optional()
    .default('1d'),
  interval: z.enum(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo'])
    .optional()
    .default('5m')
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Validate and parse input data using a Zod schema
 * Returns typed data on success, throws error with details on failure
 */
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      
      throw new Error(
        `Input validation failed: ${formattedErrors.map(e => `${e.field}: ${e.message}`).join('; ')}`
      );
    }
    throw error;
  }
}

/**
 * Create a validation error response
 */
export function createValidationErrorResponse(error: Error, corsHeaders: Record<string, string>) {
  console.error('❌ Validation error:', error.message);
  
  return new Response(
    JSON.stringify({ 
      error: 'Validation failed',
      details: error.message
    }),
    { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}