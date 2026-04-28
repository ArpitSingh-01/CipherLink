-- Migration 0010: Device & Identity Key History Indexes + FK
-- Purpose: Add missing FK and index to identity_key_history; ensure device indexes exist.
-- Safety: Fully idempotent — all statements use IF NOT EXISTS or DO $$ guards.
-- Scope: NO table modifications, NO column changes, NO RLS changes.

BEGIN;

-- ============================================================
-- STEP 1 — Device auth lookup index (device_public_key)
-- The UNIQUE constraint 'devices_device_public_key_key' already
-- creates a btree index, so this is a no-op safety net.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_devices_device_public_key
  ON devices(device_public_key);

-- ============================================================
-- STEP 2 — Device listing index (user_public_key)
-- Already exists as 'idx_devices_user_public_key' — idempotent.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_devices_user_public_key
  ON devices(user_public_key);

-- ============================================================
-- STEP 3 — FK for identity_key_history → users(public_key)
-- Currently MISSING. Wrapped in DO $$ for idempotency.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_identity_history_user'
  ) THEN
    ALTER TABLE identity_key_history
      ADD CONSTRAINT fk_identity_history_user
      FOREIGN KEY (user_public_key)
      REFERENCES users(public_key)
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================
-- STEP 4 — Index for identity key history lookups
-- SELECT * FROM identity_key_history WHERE user_public_key = $1
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_identity_history_user_public_key
  ON identity_key_history(user_public_key);

COMMIT;
