-- Secure the market_data table
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all operations on market_data" ON public.market_data;

-- Create secure RLS policies for market_data (require authentication but not user-specific)
-- Market data can be shared among authenticated users since it's public market information
CREATE POLICY "Authenticated users can view market data" 
ON public.market_data 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create market data" 
ON public.market_data 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update market data" 
ON public.market_data 
FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage market data" 
ON public.market_data 
FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role');