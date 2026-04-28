-- Migration: Structural Integrity Hardening
-- Created: 2026-03-12
-- Description: Enforces unique relationship pairs, status validation, and strict nullability for timestamps.

-- 1. HARDEN NULLABILITY FOR AUDIT TIMESTAMPS
-- Ensure we always have timing data for messages and users
ALTER TABLE users ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE users ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE messages ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE messages ALTER COLUMN updated_at SET NOT NULL;

-- 2. ENFORCE STATUS VALIDATION
-- Prevent invalid states in the friendship lifecycle
-- First ensure existing data is valid (if any is invalid, it will fail, alerting us)
-- Based on audit, we expect pending/accepted/blocked.
ALTER TABLE friends ADD CONSTRAINT check_valid_friend_status 
  CHECK (status IN ('pending', 'accepted', 'blocked'));

-- 3. PREVENT DUPLICATE RELATIONSHIPS
-- Step 3a: Prune any existing duplicate friendships (keeping the oldest)
DELETE FROM friends a USING friends b
WHERE a.id < b.id 
  AND a.user_public_key = b.user_public_key 
  AND a.friend_public_key = b.friend_public_key;

-- Add UNIQUE constraint to the pair
ALTER TABLE friends ADD CONSTRAINT unique_friendship_pair 
  UNIQUE (user_public_key, friend_public_key);

-- Step 3b: Prune duplicate blocks
DELETE FROM blocklist a USING blocklist b
WHERE a.id < b.id 
  AND a.blocker_public_key = b.blocker_public_key 
  AND a.blocked_public_key = b.blocked_public_key;

-- Replace existing non-unique index if it exists with a UNIQUE constraint
-- Note: In step 55 audit, blocklist_block_pair_idx was found as a non-unique index
DROP INDEX IF EXISTS blocklist_block_pair_idx;
ALTER TABLE blocklist ADD CONSTRAINT unique_block_pair 
  UNIQUE (blocker_public_key, blocked_public_key);

-- 4. OPTIMIZE MESSAGE QUERY PATHS
-- Ensure fast lookups for unread messages (common operation)
CREATE INDEX IF NOT EXISTS messages_unread_receiver_idx 
  ON messages(receiver_public_key) 
  WHERE is_read = false;
