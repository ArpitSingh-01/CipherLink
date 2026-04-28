-- Migration: Add conversation_id for optimized retrieval
-- Created: 2026-03-12

BEGIN;

-- 1. Add conversation_id column (allow NULL initially for backfill)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id TEXT;

-- 2. Populate conversation_id for existing messages
UPDATE messages
SET conversation_id = encode(sha256((CASE WHEN sender_public_key < receiver_public_key THEN sender_public_key ELSE receiver_public_key END || ':' || CASE WHEN sender_public_key < receiver_public_key THEN receiver_public_key ELSE sender_public_key END)::bytea), 'hex')
WHERE conversation_id IS NULL;

-- 3. Make conversation_id NOT NULL
ALTER TABLE messages ALTER COLUMN conversation_id SET NOT NULL;

-- 4. Create the new optimized index
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages (conversation_id, created_at DESC, id DESC);

-- 5. Drop the old LEAST/GREATEST functional index if it exists
DROP INDEX IF EXISTS messages_conversation_normalized_idx;

COMMIT;
