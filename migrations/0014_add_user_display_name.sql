-- Add display_name column to users table
-- This stores the user's self-chosen public-facing name (e.g., "Chrome", "Edge")
-- NOT the same as the removed friend_name — this is the USER's own name, not relationship metadata
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
