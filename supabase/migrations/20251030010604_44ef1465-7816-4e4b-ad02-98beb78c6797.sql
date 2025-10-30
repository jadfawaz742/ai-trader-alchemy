-- Add exec_message column to signals table
ALTER TABLE public.signals 
ADD COLUMN exec_message text;