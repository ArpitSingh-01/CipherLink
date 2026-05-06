-- Migration: Clean up duplicate indexes
-- Created: 2026-05-06
-- Purpose: Drop duplicate indexes identified by Supabase Performance Advisors.
--          Each pair has two identical indexes — we keep the one created by the
--          column constraint (e.g. _key suffix) and drop the explicit one (_idx suffix).
--
-- This is zero-risk: the identical remaining index provides the same functionality.

BEGIN;

-- auth_nonces: auth_nonces_nonce_idx duplicates auth_nonces_nonce_key
DROP INDEX IF EXISTS auth_nonces_nonce_idx;

-- device_challenges: device_challenges_challenge_idx duplicates device_challenges_challenge_key
DROP INDEX IF EXISTS device_challenges_challenge_idx;

-- linking_requests: linking_requests_device_idx duplicates linking_requests_device_public_key_key
DROP INDEX IF EXISTS linking_requests_device_idx;

-- messages: messages_unread_receiver_idx duplicates messages_receiver_unread_idx
DROP INDEX IF EXISTS messages_unread_receiver_idx;

COMMIT;
