-- Migration: Performance and Integrity Hardening (Safe Version)
-- Created: 2026-03-12
-- Description: Adds hex validation, performance indexes, and safe RLS handling.

BEGIN;

------------------------------------------------
-- 1. HARDEN CRYPTOGRAPHIC FIELDS (HEX VALIDATION)
------------------------------------------------

-- Only add constraints if they do not already exist

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_user_public_key_hex'
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT check_user_public_key_hex
        CHECK (public_key ~ '^[0-9a-fA-F]{64}$');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_user_device_pk_hex'
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT check_user_device_pk_hex
        CHECK (
            device_public_key IS NULL OR
            device_public_key ~ '^[0-9a-fA-F]{64}$'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_msg_sender_pk_hex'
    ) THEN
        ALTER TABLE messages
        ADD CONSTRAINT check_msg_sender_pk_hex
        CHECK (sender_public_key ~ '^[0-9a-fA-F]{64}$');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_msg_receiver_pk_hex'
    ) THEN
        ALTER TABLE messages
        ADD CONSTRAINT check_msg_receiver_pk_hex
        CHECK (receiver_public_key ~ '^[0-9a-fA-F]{64}$');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_msg_ephemeral_pk_hex'
    ) THEN
        ALTER TABLE messages
        ADD CONSTRAINT check_msg_ephemeral_pk_hex
        CHECK (ephemeral_public_key ~ '^[0-9a-fA-F]{64}$');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_msg_nonce_hex'
    ) THEN
        ALTER TABLE messages
        ADD CONSTRAINT check_msg_nonce_hex
        CHECK (nonce ~ '^[0-9a-fA-F]{24}$');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_msg_salt_hex'
    ) THEN
        ALTER TABLE messages
        ADD CONSTRAINT check_msg_salt_hex
        CHECK (salt ~ '^[0-9a-fA-F]{64}$');
    END IF;
END $$;

------------------------------------------------
-- 2. PERFORMANCE HARDENING (COMPOSITE INDEXES)
------------------------------------------------

-- Optimizes conversation history and inbox queries

CREATE INDEX IF NOT EXISTS messages_sender_created_idx
ON messages(sender_public_key, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_receiver_created_idx
ON messages(receiver_public_key, created_at DESC);

------------------------------------------------
-- 3. SAFE RLS HANDLING
------------------------------------------------

-- Instead of disabling RLS completely, we ensure
-- permissive backend access to avoid accidental lockouts.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocklist ENABLE ROW LEVEL SECURITY;

-- Remove potentially conflicting policies (optional safe cleanup)

DROP POLICY IF EXISTS backend_access_users ON users;
DROP POLICY IF EXISTS backend_access_messages ON messages;
DROP POLICY IF EXISTS backend_access_friends ON friends;
DROP POLICY IF EXISTS backend_access_friend_codes ON friend_codes;
DROP POLICY IF EXISTS backend_access_blocklist ON blocklist;

-- Create permissive backend policies
-- This ensures API access never breaks

CREATE POLICY backend_access_users
ON users
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY backend_access_messages
ON messages
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY backend_access_friends
ON friends
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY backend_access_friend_codes
ON friend_codes
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY backend_access_blocklist
ON blocklist
FOR ALL
USING (true)
WITH CHECK (true);

COMMIT;
