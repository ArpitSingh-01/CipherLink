-- Revoke direct access on all tables from anon and authenticated roles to prevent bypassing backend logic
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
REVOKE ALL ON TABLE public.friend_codes FROM anon, authenticated;
REVOKE ALL ON TABLE public.friends FROM anon, authenticated;
REVOKE ALL ON TABLE public.messages FROM anon, authenticated;
REVOKE ALL ON TABLE public.blocklist FROM anon, authenticated;
REVOKE ALL ON TABLE public.devices FROM anon, authenticated;
REVOKE ALL ON TABLE public.identity_key_history FROM anon, authenticated;
REVOKE ALL ON TABLE public.prekey_bundles FROM anon, authenticated;
REVOKE ALL ON TABLE public.device_challenges FROM anon, authenticated;
REVOKE ALL ON TABLE public.linking_requests FROM anon, authenticated;

-- Hardening Supabase Realtime channel access
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only subscribe to their own notifications" ON realtime.messages;
CREATE POLICY "Users can only subscribe to their own notifications"
ON realtime.messages
FOR SELECT
USING (
  realtime.topic() = 'notifications:' || auth.uid()::text OR
  realtime.topic() = 'notifications:' || (auth.jwt() ->> 'sub') OR
  realtime.topic() = 'notifications:' || (auth.jwt() ->> 'public_key')
);

DROP POLICY IF EXISTS "Service role bypass for realtime messages" ON realtime.messages;
CREATE POLICY "Service role bypass for realtime messages"
ON realtime.messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

