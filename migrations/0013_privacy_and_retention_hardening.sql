-- Migration: Remove friend_name from server storage (privacy hardening — FIX 5)
-- Friend names are personal relationship metadata and must only be stored locally
ALTER TABLE friends DROP COLUMN IF EXISTS friend_name;

-- FIX 4: Database-level enforcement of 24-hour data retention policy
-- Belt-and-suspenders: app already validates TTL, DB now enforces it too
ALTER TABLE messages ADD CONSTRAINT messages_ttl_max_24h
  CHECK (ttl_seconds <= 86400) NOT VALID;
ALTER TABLE messages VALIDATE CONSTRAINT messages_ttl_max_24h;

ALTER TABLE messages ADD CONSTRAINT messages_expires_within_24h
  CHECK (expires_at <= created_at + INTERVAL '24 hours') NOT VALID;
ALTER TABLE messages VALIDATE CONSTRAINT messages_expires_within_24h;
