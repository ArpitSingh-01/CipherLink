-- Migration: Multi-device and Identity Key Rotation Support (Corrected)
-- Created: 2026-03-12

BEGIN;

-- 1. Create Devices table with proper UUID type
CREATE TABLE IF NOT EXISTS "devices" (
    "device_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_public_key" TEXT NOT NULL,
    "device_public_key" TEXT NOT NULL UNIQUE,
    "device_name" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    "revoked" BOOLEAN DEFAULT false,
    CONSTRAINT fk_devices_user FOREIGN KEY (user_public_key) 
    REFERENCES users(public_key) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE
);

-- 2. Create Identity Key History table with proper UUID type
CREATE TABLE IF NOT EXISTS "identity_key_history" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_public_key" TEXT NOT NULL,
    "old_public_key" TEXT NOT NULL,
    "rotated_at" TIMESTAMPTZ DEFAULT now()
);

-- 3. Add index for device lookups
CREATE INDEX IF NOT EXISTS idx_devices_user_public_key ON devices(user_public_key);

-- 4. Update existing Foreign Keys to support ON UPDATE CASCADE
-- This is critical for identity key rotation

-- Friend Codes
ALTER TABLE friend_codes DROP CONSTRAINT IF EXISTS fk_friend_codes_identity;
ALTER TABLE friend_codes ADD CONSTRAINT fk_friend_codes_identity FOREIGN KEY (identity_public_key) REFERENCES users(public_key) ON DELETE CASCADE ON UPDATE CASCADE;

-- Friends
ALTER TABLE friends DROP CONSTRAINT IF EXISTS fk_friends_user;
ALTER TABLE friends ADD CONSTRAINT fk_friends_user FOREIGN KEY (user_public_key) REFERENCES users(public_key) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE friends DROP CONSTRAINT IF EXISTS fk_friends_friend;
ALTER TABLE friends ADD CONSTRAINT fk_friends_friend FOREIGN KEY (friend_public_key) REFERENCES users(public_key) ON DELETE CASCADE ON UPDATE CASCADE;

-- Messages
ALTER TABLE messages DROP CONSTRAINT IF EXISTS fk_messages_sender;
ALTER TABLE messages ADD CONSTRAINT fk_messages_sender FOREIGN KEY (sender_public_key) REFERENCES users(public_key) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS fk_messages_receiver;
ALTER TABLE messages ADD CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_public_key) REFERENCES users(public_key) ON DELETE CASCADE ON UPDATE CASCADE;

-- Blocklist
ALTER TABLE blocklist DROP CONSTRAINT IF EXISTS fk_blocklist_blocker;
ALTER TABLE blocklist ADD CONSTRAINT fk_blocklist_blocker FOREIGN KEY (blocker_public_key) REFERENCES users(public_key) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE blocklist DROP CONSTRAINT IF EXISTS fk_blocklist_blocked;
ALTER TABLE blocklist ADD CONSTRAINT fk_blocklist_blocked FOREIGN KEY (blocked_public_key) REFERENCES users(public_key) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
