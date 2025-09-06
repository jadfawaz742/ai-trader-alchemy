-- Add missing DELETE policies for better data management

-- Allow users to delete their own profiles (GDPR compliance)
CREATE POLICY "Users can delete their own profile" 
ON public.profiles 
FOR DELETE 
USING (auth.uid() = id);

-- Allow authenticated users and service roles to delete market data for cleanup
CREATE POLICY "Authenticated users can delete market data" 
ON public.market_data 
FOR DELETE 
USING (auth.role() = 'authenticated');