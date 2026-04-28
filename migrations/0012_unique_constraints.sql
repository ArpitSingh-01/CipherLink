-- Migration: Add unique constraints for data integrity
-- Created: 2026-04-09
-- Purpose: Prevent duplicate friendship rows (TOCTOU race conditions) and
--          ensure block deduplication works correctly via onConflictDoNothing.

-- M-1: Friends table — prevent duplicate (user, friend) pairs
-- Without this, a race condition in friend code redemption could create
-- duplicate friendship rows, corrupting the friend list.
CREATE UNIQUE INDEX IF NOT EXISTS "friends_user_friend_unique"
  ON "friends" ("user_public_key", "friend_public_key");

-- M-2: Blocklist table — upgrade existing index to unique
-- The blockUser() storage method uses onConflictDoNothing() which requires
-- a unique constraint to function. Without this, duplicate block entries
-- could accumulate and the conflict-do-nothing path would never trigger.
DROP INDEX IF EXISTS "blocklist_block_pair_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "blocklist_block_pair_idx"
  ON "blocklist" ("blocker_public_key", "blocked_public_key");
