-- Migration: Add missing salt and status fields
-- Created: 2025-01-26
-- Purpose: Add salt field to messages table and status field to friends table

-- Add salt field to messages table (for HKDF security enhancement)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS salt text;

-- Add status field to friends table (for pending friend request workflow)
ALTER TABLE friends ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Add unique constraint to prevent duplicate friend pairs
CREATE UNIQUE INDEX IF NOT EXISTS friends_unique_pair_idx 
ON friends (
  LEAST(user_public_key, friend_public_key), 
  GREATEST(user_public_key, friend_public_key)
);

-- Add comment for documentation
COMMENT ON COLUMN messages.salt IS 'Random salt for HKDF key derivation (optional for backward compatibility with old messages)';
COMMENT ON COLUMN friends.status IS 'Friend request status: pending or accepted';
