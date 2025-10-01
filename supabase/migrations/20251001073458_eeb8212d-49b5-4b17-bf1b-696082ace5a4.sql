-- Fix trigger for bot_adaptive_parameters table
-- Problem: Trigger tries to update 'updated_at' but column is named 'last_updated'

-- Drop the incorrect trigger
DROP TRIGGER IF EXISTS update_bot_adaptive_parameters_updated_at ON bot_adaptive_parameters;

-- Create a new function for tables with 'last_updated' column
CREATE OR REPLACE FUNCTION public.update_last_updated_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$function$;

-- Create the correct trigger for bot_adaptive_parameters
CREATE TRIGGER update_bot_adaptive_parameters_last_updated
  BEFORE UPDATE ON bot_adaptive_parameters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_last_updated_column();

-- Also check market_data table (it also has last_updated)
DROP TRIGGER IF EXISTS update_market_data_updated_at ON market_data;

CREATE TRIGGER update_market_data_last_updated
  BEFORE UPDATE ON market_data
  FOR EACH ROW
  EXECUTE FUNCTION public.update_last_updated_column();