-- Migration: Diamond Hardening Pass
-- Created: 2026-03-11
-- Purpose: Add unique constraints and indexes for security hardening

-- SEC-HARDEN: Add unique constraint on blocklist to prevent duplicate blocks
-- (onConflictDoNothing requires a unique constraint)
CREATE UNIQUE INDEX IF NOT EXISTS blocklist_unique_pair_idx
ON blocklist (blocker_public_key, blocked_public_key);

-- SEC-HARDEN: Add composite index for replay protection queries
-- Optimizes isMessageDuplicate(senderPublicKey, nonce, ephemeralPublicKey) lookups
CREATE INDEX IF NOT EXISTS messages_replay_check_idx
ON messages (sender_public_key, nonce, ephemeral_public_key);
