-- Migration: Optimized Messages Index for Normalized Conversation Retrieval
-- Created: 2026-03-12
-- Description: Adds a functional index to support the LEAST/GREATEST conversation query pattern.

BEGIN;

-- 1. Create the optimal functional index
-- This matches the query: 
-- WHERE LEAST(sender, receiver) = LEAST($1, $2) 
-- AND GREATEST(sender, receiver) = GREATEST($1, $2)
-- ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS messages_conversation_normalized_idx 
ON messages (
  LEAST(sender_public_key, receiver_public_key), 
  GREATEST(sender_public_key, receiver_public_key), 
  created_at DESC
);

-- 2. Drop the old, less efficient index (optional but recommended to save space)
-- DROP INDEX IF EXISTS messages_conversation_idx;

COMMIT;
