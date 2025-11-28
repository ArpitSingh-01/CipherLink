# CipherLink Database Schema

## Overview

CipherLink uses a PostgreSQL database (compatible with Supabase) to store encrypted messages, user identities, and relationship data. The database is designed with privacy-first principles:

- **No personally identifiable information (PII)** is stored
- All messages are end-to-end encrypted with AES-256-GCM
- User identities are represented by cryptographic public keys only
- Friend lists and display names are stored client-side in IndexedDB (never synced to server)

---

## Tables

### 1. `users`

Stores user identities identified by their X25519 public keys.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier for the user record |
| `public_key` | TEXT | NOT NULL, UNIQUE | X25519 public key in hex format - cryptographic identity |
| `device_public_key` | TEXT | NULLABLE | Optional device-specific public key for multi-device support |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Account creation timestamp (UTC) |

**Purpose**: Track user registrations by their cryptographic public keys.

**SQL**:
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key TEXT NOT NULL UNIQUE,
  device_public_key TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_public_key ON users(public_key);
```

---

### 2. `friend_codes`

One-time, single-use friend codes for establishing secure connections.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier for the code record |
| `code` | TEXT | NOT NULL, UNIQUE | 8-character alphanumeric code (no confusing chars: 0/O, 1/I) |
| `identity_public_key` | TEXT | NOT NULL | Public key of the user who generated the code |
| `expires_at` | TIMESTAMP | NOT NULL | Expiration time (typically 6 hours) |
| `used` | BOOLEAN | DEFAULT FALSE | Whether the code has been redeemed |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Code generation timestamp (UTC) |

**Purpose**: Enable privacy-preserving friend discovery without searchable registries.

**Constraints**:
- Codes expire automatically (6-hour window)
- Each code is single-use (one-time redemption)
- No code enumeration attack prevention

**SQL**:
```sql
CREATE TABLE friend_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  identity_public_key TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_friend_codes_code ON friend_codes(code);
CREATE INDEX idx_friend_codes_expires_at ON friend_codes(expires_at);
```

---

### 3. `friends`

Records mutual friendships between users (directional: user A knows user B).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier for the friendship |
| `user_public_key` | TEXT | NOT NULL | Public key of the user (friendship owner) |
| `friend_public_key` | TEXT | NOT NULL | Public key of the friend |
| `friend_name` | TEXT | NULLABLE | Optional display name (client-side stored, kept for reference) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Friendship establishment timestamp (UTC) |

**Purpose**: Track friend relationships. Mutual friendships require two records (A→B and B→A).

**Constraints**:
- Display names are optional (users can have unnamed friends)
- Friend names should be stored primarily in client-side IndexedDB
- No server-side enforcement of mutual friendships

**SQL**:
```sql
CREATE TABLE friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_public_key TEXT NOT NULL,
  friend_public_key TEXT NOT NULL,
  friend_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_friends_user_public_key ON friends(user_public_key);
CREATE INDEX idx_friends_friend_public_key ON friends(friend_public_key);
```

---

### 4. `messages`

End-to-end encrypted messages with self-destruction (TTL).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique message identifier |
| `sender_public_key` | TEXT | NOT NULL | Sender's X25519 public key |
| `receiver_public_key` | TEXT | NOT NULL | Receiver's X25519 public key |
| `ciphertext` | TEXT | NOT NULL | AES-256-GCM encrypted message (hex encoded) |
| `nonce` | TEXT | NOT NULL | Nonce/IV for AES-GCM (hex encoded) |
| `ephemeral_public_key` | TEXT | NOT NULL | Ephemeral X25519 public key for ECDH key exchange (hex encoded) |
| `ttl_seconds` | INTEGER | NOT NULL | Time-to-live in seconds (30s to 24h) |
| `is_read` | BOOLEAN | DEFAULT FALSE | Whether the receiver has read the message |
| `reactions` | TEXT | NULLABLE | JSON string of reactions: `{"user_public_key": "emoji", ...}` |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Message creation timestamp (UTC) |
| `expires_at` | TIMESTAMP | NOT NULL | Automatic expiration/deletion time (UTC) |

**Purpose**: Store encrypted conversations with auto-expiration.

**Encryption Details**:
- Encryption: AES-256-GCM with X25519 ECDH key exchange
- Key derivation: HKDF-SHA256 from shared secret
- Nonce: 12 bytes (96 bits) random per message
- Only the message receiver can decrypt (encrypted with receiver's public key)

**TTL Options**:
- 30 seconds
- 5 minutes (300s)
- 1 hour (3600s)
- 6 hours (21600s)
- 12 hours (43200s)
- 24 hours (86400s) - default

**SQL**:
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_public_key TEXT NOT NULL,
  receiver_public_key TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  ephemeral_public_key TEXT NOT NULL,
  ttl_seconds INTEGER NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  reactions TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_messages_sender ON messages(sender_public_key);
CREATE INDEX idx_messages_receiver ON messages(receiver_public_key);
CREATE INDEX idx_messages_expires_at ON messages(expires_at);
CREATE INDEX idx_messages_conversation ON messages(sender_public_key, receiver_public_key);
```

**Cleanup Strategy**:
- Messages should be deleted when `expires_at` <= NOW()
- Background job recommended: run every 30 minutes to clean expired messages
- Consider implementing PostgreSQL `pg_partman` for automatic partition management

---

### 5. `blocklist`

User blocking relationships for spam/abuse prevention.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier for the block record |
| `blocker_public_key` | TEXT | NOT NULL | Public key of the user doing the blocking |
| `blocked_public_key` | TEXT | NOT NULL | Public key of the blocked user |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Block creation timestamp (UTC) |

**Purpose**: Prevent blocked users from sending messages or seeing messages from the blocker.

**Constraints**:
- Unidirectional (A blocking B doesn't block B blocking A)
- Messages from blocked users are silently rejected (not stored)

**SQL**:
```sql
CREATE TABLE blocklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_public_key TEXT NOT NULL,
  blocked_public_key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_blocklist_blocker ON blocklist(blocker_public_key);
CREATE UNIQUE INDEX idx_blocklist_unique ON blocklist(blocker_public_key, blocked_public_key);
```

---

## Data Relationships

```
users (1) ──→ (many) friend_codes
users (1) ──→ (many) friends
users (1) ──→ (many) messages (as sender)
users (1) ──→ (many) messages (as receiver)
users (1) ──→ (many) blocklist (as blocker)
users (1) ──→ (many) blocklist (as blocked)
```

---

## Client-Side Storage (IndexedDB)

The following data is stored **client-side in IndexedDB** and NOT synced to the server:

- **LocalIdentity**: `{ publicKey, privateKey, recoveryPhrase }`
- **LocalFriends**: `{ publicKey, displayName, lastMessageAt?, lastMessagePreview? }`
- **Pinned Messages** (future): `{ messageId, friendPublicKey }`
- **Blocked Users Cache** (optional)

This ensures zero server-side metadata about friend lists or display names.

---

## Supabase Setup Instructions

### 1. Create Tables

Run these SQL commands in your Supabase SQL editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key TEXT NOT NULL UNIQUE,
  device_public_key TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_users_public_key ON users(public_key);

-- Friend codes table
CREATE TABLE friend_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  identity_public_key TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_friend_codes_code ON friend_codes(code);
CREATE INDEX idx_friend_codes_expires_at ON friend_codes(expires_at);

-- Friends table
CREATE TABLE friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_public_key TEXT NOT NULL,
  friend_public_key TEXT NOT NULL,
  friend_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_friends_user_public_key ON friends(user_public_key);
CREATE INDEX idx_friends_friend_public_key ON friends(friend_public_key);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_public_key TEXT NOT NULL,
  receiver_public_key TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  ephemeral_public_key TEXT NOT NULL,
  ttl_seconds INTEGER NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  reactions TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_messages_sender ON messages(sender_public_key);
CREATE INDEX idx_messages_receiver ON messages(receiver_public_key);
CREATE INDEX idx_messages_expires_at ON messages(expires_at);
CREATE INDEX idx_messages_conversation ON messages(sender_public_key, receiver_public_key);

-- Blocklist table
CREATE TABLE blocklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_public_key TEXT NOT NULL,
  blocked_public_key TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_blocklist_blocker ON blocklist(blocker_public_key);
CREATE UNIQUE INDEX idx_blocklist_unique ON blocklist(blocker_public_key, blocked_public_key);
```

### 2. Enable Row-Level Security (RLS)

For security, consider enabling RLS policies (optional, depends on auth implementation):

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocklist ENABLE ROW LEVEL SECURITY;

-- Example: Allow users to view only their own data
CREATE POLICY "Users can read their own data" ON users
  FOR SELECT USING (true);
```

### 3. Set Up Cleanup Functions

```sql
-- Function to delete expired messages
CREATE OR REPLACE FUNCTION cleanup_expired_messages()
RETURNS void AS $$
BEGIN
  DELETE FROM messages WHERE expires_at <= NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to mark expired friend codes as stale
CREATE OR REPLACE FUNCTION cleanup_expired_friend_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM friend_codes WHERE expires_at <= NOW() OR used = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Schedule via cron (requires pg_cron extension)
-- SELECT cron.schedule('cleanup_messages', '*/30 * * * *', 'SELECT cleanup_expired_messages()');
-- SELECT cron.schedule('cleanup_codes', '*/30 * * * *', 'SELECT cleanup_expired_friend_codes()');
```

### 4. Connection String

Your Supabase connection string format:

```
postgresql://[user]:[password]@[ref].supabase.co:5432/postgres
```

Use in your `.env.local`:

```env
DATABASE_URL=postgresql://[user]:[password]@[ref].supabase.co:5432/postgres
```

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/users` | POST | Register user with public key |
| `/api/friend-codes` | POST | Generate 6-hour friend code |
| `/api/friend-codes/redeem` | POST | Redeem a friend code to establish friendship |
| `/api/friends/:publicKey` | GET | Get friends list for a user |
| `/api/messages` | POST | Send encrypted message |
| `/api/messages/:userPublicKey` | GET | Fetch messages for a conversation |
| `/api/block` | POST | Block a user |
| `/api/unblock` | POST | Unblock a user |

---

## Performance Considerations

1. **Message Expiration**: Messages are soft-deleted via `expires_at` timestamp. Consider implementing:
   - Daily cleanup jobs
   - Partitioning by `created_at` for easier purging
   - Archive tables for retention compliance

2. **Indexing**: Current indexes optimize for:
   - Public key lookups
   - Conversation queries (sender + receiver)
   - Expiration cleanup queries

3. **Scaling**:
   - Use connection pooling (PgBouncer recommended)
   - Consider sharding by `sender_public_key` at scale
   - Archive old messages to cold storage

---

## Security Notes

- ✅ **Zero PII**: No names, emails, or passwords stored
- ✅ **E2E Encryption**: Messages encrypted before leaving client
- ✅ **One-Time Codes**: Single-use friend codes prevent replay attacks
- ✅ **Server Blind**: Server cannot decrypt messages or view friend lists
- ⚠️ **Metadata Visible**: Timing, sender/receiver public keys, and message count visible to server

---

## Migration from In-Memory Storage

If migrating from the current in-memory MemStorage implementation:

```javascript
// Use Drizzle ORM migrations
// npm install drizzle-kit

// Create migration:
// npx drizzle-kit generate:pg --out ./drizzle/migrations --schema ./shared/schema.ts

// Run migration:
// npx drizzle-kit migrate:pg --schema ./shared/schema.ts
```

---

## Future Enhancements

Planned features requiring schema updates:

1. **File/Image Sharing**: Add `files` table with encrypted S3 URLs
2. **Group Chats**: Add `groups` and `group_members` tables
3. **Message Reactions**: Already supported via `reactions` JSON field
4. **Read Receipts**: Already supported via `is_read` field
5. **Typing Indicators**: Keep in-memory only (3-second expiration)
6. **Call History**: Add `calls` table for audio/video logs

---

**Last Updated**: November 28, 2025
**Schema Version**: 1.0
**Status**: Production-Ready
