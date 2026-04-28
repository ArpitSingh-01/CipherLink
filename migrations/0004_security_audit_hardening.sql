-- Migration: Security Audit Hardening
-- Created: 2026-03-11

-- STEP 4 - Cryptographic Data Validation
-- Public keys must be 64 hex characters
ALTER TABLE users ADD CONSTRAINT check_user_public_key_length CHECK (length(public_key) = 64);
ALTER TABLE users ADD CONSTRAINT check_user_device_public_key_length CHECK (device_public_key IS NULL OR length(device_public_key) = 64);

ALTER TABLE friend_codes ADD CONSTRAINT check_fc_identity_public_key_length CHECK (length(identity_public_key) = 64);

ALTER TABLE friends ADD CONSTRAINT check_friend_user_public_key_length CHECK (length(user_public_key) = 64);
ALTER TABLE friends ADD CONSTRAINT check_friend_friend_public_key_length CHECK (length(friend_public_key) = 64);

ALTER TABLE messages ADD CONSTRAINT check_msg_sender_public_key_length CHECK (length(sender_public_key) = 64);
ALTER TABLE messages ADD CONSTRAINT check_msg_receiver_public_key_length CHECK (length(receiver_public_key) = 64);
ALTER TABLE messages ADD CONSTRAINT check_msg_ephemeral_public_key_length CHECK (length(ephemeral_public_key) = 64);
ALTER TABLE messages ADD CONSTRAINT check_msg_nonce_length CHECK (length(nonce) = 24);
ALTER TABLE messages ADD CONSTRAINT check_msg_salt_length CHECK (length(salt) = 64);

ALTER TABLE blocklist ADD CONSTRAINT check_blocklist_blocker_public_key_length CHECK (length(blocker_public_key) = 64);
ALTER TABLE blocklist ADD CONSTRAINT check_blocklist_blocked_public_key_length CHECK (length(blocked_public_key) = 64);

-- STEP 6 - TIMESTAMP SAFETY
-- Add trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE friend_codes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE friends ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE blocklist ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_friend_codes_updated_at BEFORE UPDATE ON friend_codes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_friends_updated_at BEFORE UPDATE ON friends FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blocklist_updated_at BEFORE UPDATE ON blocklist FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- STEP 7 - NULLABILITY HARDENING
-- Update existing null salts to dummy valid hex (though they should not exist since our backend already required them, but for strictness)
UPDATE messages SET salt = repeat('0', 64) WHERE salt IS NULL;
ALTER TABLE messages ALTER COLUMN salt SET NOT NULL;

-- STEP 8 - BUSINESS LOGIC PROTECTION
-- Prevent self-messaging
ALTER TABLE messages ADD CONSTRAINT check_no_self_messaging CHECK (sender_public_key <> receiver_public_key);
-- Prevent self-blocking
ALTER TABLE blocklist ADD CONSTRAINT check_no_self_blocking CHECK (blocker_public_key <> blocked_public_key);
-- Prevent self-friending
ALTER TABLE friends ADD CONSTRAINT check_no_self_friending CHECK (user_public_key <> friend_public_key);

-- STEP 9 - CASCADE SAFETY
-- Prune orphaned data before adding foreign keys to avoid violation errors
DELETE FROM friend_codes WHERE identity_public_key NOT IN (SELECT public_key FROM users);
DELETE FROM friends WHERE user_public_key NOT IN (SELECT public_key FROM users) OR friend_public_key NOT IN (SELECT public_key FROM users);
DELETE FROM messages WHERE sender_public_key NOT IN (SELECT public_key FROM users) OR receiver_public_key NOT IN (SELECT public_key FROM users);
DELETE FROM blocklist WHERE blocker_public_key NOT IN (SELECT public_key FROM users) OR blocked_public_key NOT IN (SELECT public_key FROM users);

-- Add foreign key constraints with ON DELETE CASCADE
ALTER TABLE friend_codes 
  ADD CONSTRAINT fk_friend_codes_identity FOREIGN KEY (identity_public_key) REFERENCES users(public_key) ON DELETE CASCADE;

ALTER TABLE friends 
  ADD CONSTRAINT fk_friends_user FOREIGN KEY (user_public_key) REFERENCES users(public_key) ON DELETE CASCADE,
  ADD CONSTRAINT fk_friends_friend FOREIGN KEY (friend_public_key) REFERENCES users(public_key) ON DELETE CASCADE;

ALTER TABLE messages 
  ADD CONSTRAINT fk_messages_sender FOREIGN KEY (sender_public_key) REFERENCES users(public_key) ON DELETE CASCADE,
  ADD CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_public_key) REFERENCES users(public_key) ON DELETE CASCADE;

ALTER TABLE blocklist 
  ADD CONSTRAINT fk_blocklist_blocker FOREIGN KEY (blocker_public_key) REFERENCES users(public_key) ON DELETE CASCADE,
  ADD CONSTRAINT fk_blocklist_blocked FOREIGN KEY (blocked_public_key) REFERENCES users(public_key) ON DELETE CASCADE;

-- STEP 11 - ROW LEVEL SECURITY (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own record" ON users
  FOR ALL USING (public_key = auth.uid()::text);

CREATE POLICY "Users can access own messages" ON messages
  FOR ALL USING (sender_public_key = auth.uid()::text OR receiver_public_key = auth.uid()::text);

CREATE POLICY "Users can access own friends" ON friends
  FOR ALL USING (user_public_key = auth.uid()::text OR friend_public_key = auth.uid()::text);

CREATE POLICY "Users can access own friend_codes" ON friend_codes
  FOR ALL USING (identity_public_key = auth.uid()::text);

CREATE POLICY "Users can access own blocklist" ON blocklist
  FOR ALL USING (blocker_public_key = auth.uid()::text OR blocked_public_key = auth.uid()::text);

-- STEP 12 - DATA SIZE LIMITS
ALTER TABLE messages ADD CONSTRAINT check_ciphertext_size CHECK (length(ciphertext) <= 500000);
ALTER TABLE messages ADD CONSTRAINT check_reactions_size CHECK (reactions IS NULL OR length(reactions) <= 10000);

-- STEP 5 - INDEXING FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);
CREATE INDEX IF NOT EXISTS blocklist_blocked_public_key_idx ON blocklist(blocked_public_key);
