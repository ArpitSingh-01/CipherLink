-- Migration 0019: Remove non-functional Supabase Auth RLS policies.
-- The application uses custom Ed25519 header auth, not Supabase JWT sessions.
-- auth.uid() is always NULL when connecting via the postgres service role,
-- making these policies effectively dead code (security theater).
-- Access control is enforced at the application layer (Express middleware).

DROP POLICY IF EXISTS "Users can access their own record" ON users;
DROP POLICY IF EXISTS "Users can access own messages" ON messages;
DROP POLICY IF EXISTS "Users can access own friends" ON friends;
DROP POLICY IF EXISTS "Users can access own friend_codes" ON friend_codes;
DROP POLICY IF EXISTS "Users can access own blocklist" ON blocklist;

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE friend_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE friends DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE blocklist DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE users IS
  'Access controlled at application layer via Ed25519 signature verification. RLS disabled intentionally.';
COMMENT ON TABLE messages IS
  'E2E encrypted payloads. Server never reads ciphertext. Application-layer access control only.';
