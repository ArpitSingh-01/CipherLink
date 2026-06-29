-- Migration 0020: Add missing CHECK constraint on friends.status.
-- The Drizzle schema was missing this constraint; only migration 0005 had it.
-- This migration is idempotent — the constraint may already exist on some instances.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'friends_valid_status' AND conrelid = 'friends'::regclass
  ) THEN
    ALTER TABLE friends
      ADD CONSTRAINT friends_valid_status
      CHECK (status IN ('pending', 'accepted'));
  END IF;
END $$;

-- Remove the unused 'blocked' value path from any existing data
-- (no rows should have this value, but clean up defensively)
UPDATE friends SET status = 'pending'
  WHERE status NOT IN ('pending', 'accepted');
