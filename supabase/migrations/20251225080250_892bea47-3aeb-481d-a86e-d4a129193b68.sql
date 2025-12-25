-- Add email column to emergency_contacts table
ALTER TABLE public.emergency_contacts 
ADD COLUMN email text;