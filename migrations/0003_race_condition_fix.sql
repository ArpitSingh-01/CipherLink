-- SEC-FIX: Add unique constraint to prevent race condition in replay protection
-- This ensures that duplicate messages are rejected at the database level,
-- preventing the race condition where multiple identical requests could pass
-- the duplicate check before the first one is inserted.

-- Add unique constraint on (sender_public_key, nonce, ephemeral_public_key)
-- This combination uniquely identifies a message and prevents replays
ALTER TABLE messages 
ADD CONSTRAINT unique_message_replay 
UNIQUE (sender_public_key, nonce, ephemeral_public_key);

-- Note: If there are existing duplicate messages, this migration will fail.
-- In that case, clean up duplicates first:
-- DELETE FROM messages a USING messages b
-- WHERE a.id < b.id 
-- AND a.sender_public_key = b.sender_public_key 
-- AND a.nonce = b.nonce 
-- AND a.ephemeral_public_key = b.ephemeral_public_key;
