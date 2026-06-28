-- Drop the display_name column from the users table to enforce zero-identity-trace architecture
ALTER TABLE public.users DROP COLUMN IF EXISTS display_name;
