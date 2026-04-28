-- Migration: Add missing security tables
-- Created: 2026-04-03
-- Purpose: Creates auth_nonces, device_challenges, prekey_bundles, and one_time_prekeys
--          tables that exist in the Drizzle schema but were never applied to the database.
--          auth_nonces is the immediate blocker preventing device registration (500 error).

BEGIN;

-- ============================================================
-- 1. AUTH NONCES — server-side replay protection for signed requests (5-min TTL)
-- ============================================================
CREATE TABLE IF NOT EXISTS "auth_nonces" (
    "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "nonce"      TEXT NOT NULL UNIQUE,
    "public_key" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_nonces_nonce_idx"      ON "auth_nonces" ("nonce");
CREATE INDEX        IF NOT EXISTS "auth_nonces_expires_at_idx" ON "auth_nonces" ("expires_at");

-- Auto-clean expired nonces (safety net; application also prunes them)
-- Note: Supabase pg_cron can schedule this, but a simple DELETE on read is the primary strategy.

-- ============================================================
-- 2. DEVICE CHALLENGES — challenge-response device registration
-- ============================================================
CREATE TABLE IF NOT EXISTS "device_challenges" (
    "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_public_key" TEXT NOT NULL,
    "challenge"       TEXT NOT NULL UNIQUE,
    "expires_at"      TIMESTAMPTZ NOT NULL,
    "used"            BOOLEAN DEFAULT false,
    "created_at"      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_device_challenges_user
        FOREIGN KEY ("user_public_key")
        REFERENCES "users" ("public_key")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "device_challenges_challenge_idx" ON "device_challenges" ("challenge");
CREATE INDEX        IF NOT EXISTS "device_challenges_user_idx"       ON "device_challenges" ("user_public_key");
CREATE INDEX        IF NOT EXISTS "device_challenges_expires_at_idx" ON "device_challenges" ("expires_at");

-- ============================================================
-- 3. PREKEY BUNDLES — persistent DB-backed X3DH prekey store
-- ============================================================
CREATE TABLE IF NOT EXISTS "prekey_bundles" (
    "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "identity_public_key" TEXT NOT NULL UNIQUE,
    "signed_pre_key"      TEXT NOT NULL,
    "pre_key_signature"   TEXT NOT NULL,
    "uploaded_at"         TIMESTAMPTZ DEFAULT now() NOT NULL,
    "expires_at"          TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_prekey_bundles_user
        FOREIGN KEY ("identity_public_key")
        REFERENCES "users" ("public_key")
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "prekey_bundles_identity_key_idx" ON "prekey_bundles" ("identity_public_key");
CREATE INDEX IF NOT EXISTS "prekey_bundles_expires_at_idx"   ON "prekey_bundles" ("expires_at");

-- ============================================================
-- 4. ONE-TIME PREKEYS — consumed once per X3DH session initiation
-- ============================================================
CREATE TABLE IF NOT EXISTS "one_time_prekeys" (
    "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "identity_public_key" TEXT NOT NULL,
    "one_time_pre_key"    TEXT NOT NULL UNIQUE,
    "used"                BOOLEAN DEFAULT false NOT NULL,
    "uploaded_at"         TIMESTAMPTZ DEFAULT now() NOT NULL,
    "expires_at"          TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_otpk_user
        FOREIGN KEY ("identity_public_key")
        REFERENCES "users" ("public_key")
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "opk_identity_key_idx" ON "one_time_prekeys" ("identity_public_key");
CREATE INDEX IF NOT EXISTS "opk_used_idx"          ON "one_time_prekeys" ("used");
CREATE INDEX IF NOT EXISTS "opk_expires_at_idx"    ON "one_time_prekeys" ("expires_at");

COMMIT;
