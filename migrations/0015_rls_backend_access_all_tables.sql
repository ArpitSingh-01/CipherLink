-- Migration: Consolidated RLS Backend Access for All Tables
-- Created: 2026-05-05
-- Purpose: Ensures ALL tables have proper backend access policies so the
--          Express/Drizzle backend (connecting as `postgres` role) can
--          perform CRUD operations without being blocked by RLS.
--
-- Background: Migration 0004 created auth.uid()-based policies that only work
--             with Supabase Auth. Since CipherLink uses custom Ed25519 auth,
--             auth.uid() always returns NULL → all operations are denied.
--             Migration 0006 partially fixed this with backend_access_* policies,
--             but tables added later (0009, 0011) were never covered.
--             This migration is fully idempotent and safe to re-run.

BEGIN;

-- ============================================================
-- 1. Remove conflicting auth.uid()-based policies (from migration 0004)
--    These policies ALWAYS DENY because we don't use Supabase Auth.
-- ============================================================

DROP POLICY IF EXISTS "Users can access their own record" ON users;
DROP POLICY IF EXISTS "Users can access own messages" ON messages;
DROP POLICY IF EXISTS "Users can access own friends" ON friends;
DROP POLICY IF EXISTS "Users can access own friend_codes" ON friend_codes;
DROP POLICY IF EXISTS "Users can access own blocklist" ON blocklist;

-- ============================================================
-- 2. Enable RLS on ALL tables (idempotent — safe to re-run)
-- ============================================================

ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_codes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends              ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocklist            ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_key_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE prekey_bundles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_challenges    ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_time_prekeys     ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_nonces          ENABLE ROW LEVEL SECURITY;
ALTER TABLE linking_requests     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Drop existing backend_access policies (idempotent cleanup)
-- ============================================================

DROP POLICY IF EXISTS backend_access_users              ON users;
DROP POLICY IF EXISTS backend_access_friend_codes       ON friend_codes;
DROP POLICY IF EXISTS backend_access_friends            ON friends;
DROP POLICY IF EXISTS backend_access_messages           ON messages;
DROP POLICY IF EXISTS backend_access_blocklist          ON blocklist;
DROP POLICY IF EXISTS backend_access_devices            ON devices;
DROP POLICY IF EXISTS backend_access_identity_key_history ON identity_key_history;
DROP POLICY IF EXISTS backend_access_prekey_bundles     ON prekey_bundles;
DROP POLICY IF EXISTS backend_access_device_challenges  ON device_challenges;
DROP POLICY IF EXISTS backend_access_one_time_prekeys   ON one_time_prekeys;
DROP POLICY IF EXISTS backend_access_auth_nonces        ON auth_nonces;
DROP POLICY IF EXISTS backend_access_linking_requests   ON linking_requests;

-- ============================================================
-- 4. Create permissive backend access policies for ALL tables
--    USING (true) + WITH CHECK (true) = allow all operations
--    This is safe because the backend enforces its own auth
--    via Ed25519 signatures in the requireAuth middleware.
-- ============================================================

CREATE POLICY backend_access_users
ON users FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY backend_access_friend_codes
ON friend_codes FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY backend_access_friends
ON friends FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY backend_access_messages
ON messages FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY backend_access_blocklist
ON blocklist FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY backend_access_devices
ON devices FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY backend_access_identity_key_history
ON identity_key_history FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY backend_access_prekey_bundles
ON prekey_bundles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY backend_access_device_challenges
ON device_challenges FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY backend_access_one_time_prekeys
ON one_time_prekeys FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY backend_access_auth_nonces
ON auth_nonces FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY backend_access_linking_requests
ON linking_requests FOR ALL USING (true) WITH CHECK (true);

COMMIT;
