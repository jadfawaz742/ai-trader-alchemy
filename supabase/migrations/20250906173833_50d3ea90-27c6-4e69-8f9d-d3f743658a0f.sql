-- Add user_id column to stock_analysis table to associate analysis with users
ALTER TABLE public.stock_analysis 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update existing records to have a default user_id (if any exist)
-- This will need to be handled based on your user data
-- For now, we'll leave existing records with NULL user_id

-- Drop the overly permissive RLS policy
DROP POLICY IF EXISTS "Allow all operations on stock_analysis" ON public.stock_analysis;

-- Create secure RLS policies for stock_analysis
-- Users can only see their own analysis
CREATE POLICY "Users can view their own stock analysis" 
ON public.stock_analysis 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can only create analysis for themselves
CREATE POLICY "Users can create their own stock analysis" 
ON public.stock_analysis 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can only update their own analysis
CREATE POLICY "Users can update their own stock analysis" 
ON public.stock_analysis 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Users can only delete their own analysis
CREATE POLICY "Users can delete their own stock analysis" 
ON public.stock_analysis 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create an index on user_id for better performance
CREATE INDEX IF NOT EXISTS idx_stock_analysis_user_id ON public.stock_analysis(user_id);