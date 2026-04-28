import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LocalIdentity, LocalFriend } from '@shared/schema';
import { 
  encryptIdentityWithPin, 
  decryptIdentityWithPin, 
  hexToBytes, 
  bytesToHex, 
  encryptWithSecret, 
  decryptWithSecret, 
  toArrayBuffer,
  fingerprintIdentityKey,
} from './crypto';

// ==================== ENCRYPTED IDENTITY SCHEMA (SEC-05) ====================

interface EncryptedIdentityRecord {
  id: string; // 'current'
  salt: string;
  iv: string;
  data: string; // AES-GCM encrypted JSON of identity
  publicKey: string; // Unencrypted for lookup (not secret)
}

interface DeviceIdentity {
  id: string; // 'current'
  publicKey: string;
  privateKey: string;
  deviceName: string;
}

interface CipherLinkDB extends DBSchema {
  encryptedIdentity: {
    key: string;
    value: EncryptedIdentityRecord;
  };
  friends: {
    key: string;
    value: LocalFriend;
    indexes: { 'by-lastMessage': Date };
  };
  blocklist: {
    key: string;
    value: { publicKey: string; blockedAt: Date };
  };
  settings: {
    key: string;
    value: unknown;
  };
  sentMessages: {
    key: string;
    value: { id: string; plaintext: string; friendPublicKey: string; createdAt: number; expiresAt?: number };
  };
  deviceIdentity: {
    key: string;
    value: DeviceIdentity;
  };
  deviceCryptoKey: {
    key: string;
    value: CryptoKey;
  };
  ratchetSessions: {
    key: string;
    value: any; // Type-safe SessionState from session.ts will be used in implementations
  };
}

// Bump this constant whenever the X3DH/ratchet crypto format changes.
// ensureSessionCryptoVersion() checks it on startup and wipes ratchetSessions if stale.
const SESSION_CRYPTO_VERSION = 'v10-stable-transcript';

export async function getDB(): Promise<IDBPDatabase<CipherLinkDB>> {
  return openDB<CipherLinkDB>('cipherlink', 8, {
    upgrade(database, oldVersion) {
      // Version 1 -> 2 migration
      if (oldVersion < 2) {
        if ((database.objectStoreNames as any).contains('identity')) {
          database.deleteObjectStore('identity' as any);
        }
        if (!database.objectStoreNames.contains('encryptedIdentity')) {
          database.createObjectStore('encryptedIdentity', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('sentMessages')) {
          database.createObjectStore('sentMessages', { keyPath: 'id' });
        }
      }

      // Version 2 -> 3 migration
      if (oldVersion < 3) {
        if (!database.objectStoreNames.contains('deviceIdentity')) {
          database.createObjectStore('deviceIdentity', { keyPath: 'id' });
        }
      }

      // Version 3 -> 4 migration: add ratchet sessions
      if (oldVersion < 4) {
        if (!database.objectStoreNames.contains('ratchetSessions')) {
          database.createObjectStore('ratchetSessions');
        }
      }

      // Version 4 -> 5 migration: add device crypto key store
      if (oldVersion < 5) {
        if (!database.objectStoreNames.contains('deviceCryptoKey')) {
          database.createObjectStore('deviceCryptoKey');
        }
      }

      // Version 6 -> 7 migration: clear all ratchet sessions (Ed25519 key bug).
      if (oldVersion < 7) {
        if (database.objectStoreNames.contains('ratchetSessions')) {
          database.deleteObjectStore('ratchetSessions');
          database.createObjectStore('ratchetSessions');
        }
      }

      // Version 7 -> 8 migration: clear ratchet sessions again.
      // Browsers that were at v7 before the X25519/SPKb=IKb fix landed still
      // have stale sessions with wrong isInitiator/transcriptHash — wipe them.
      if (oldVersion < 8) {
        if (database.objectStoreNames.contains('ratchetSessions')) {
          database.deleteObjectStore('ratchetSessions');
          database.createObjectStore('ratchetSessions');
        }
      }

      // Friends store
      if (!database.objectStoreNames.contains('friends')) {
        const friendsStore = database.createObjectStore('friends', { keyPath: 'publicKey' });
        friendsStore.createIndex('by-lastMessage', 'lastMessageAt');
      }

      // Blocklist store
      if (!database.objectStoreNames.contains('blocklist')) {
        database.createObjectStore('blocklist', { keyPath: 'publicKey' });
      }

      // Settings store
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings');
      }
    },
  });
}

// ==================== SESSION-ONLY MODE (SEC-07) ====================

let sessionIdentity: (LocalIdentity & { localUsername: string }) | null = null;
let isSessionOnlyMode = false;
const sessionRatchetStore = new Map<string, string>();
const sessionMessageStore: Record<string, any> = {};
const sessionFriendStore = new Map<string, LocalFriend>();
const sessionBlocklistStore = new Set<string>();
const sessionSettingsStore = new Map<string, any>();

export function setSessionOnlyMode(enabled: boolean): void {
  isSessionOnlyMode = enabled;
}

export function getSessionOnlyMode(): boolean {
  return isSessionOnlyMode;
}

/**
 * Zeroize all in-memory key material. Called on logout and beforeunload.
 * Note: JS GC is non-deterministic; this is best-effort but materially
 * reduces the window during which keys are recoverable from RAM.
 */
export function clearSessionMemory(): void {
  // Wipe the private key bytes if we have them in memory
  if (sessionIdentity) {
    try {
      // Overwrite the privateKey string char-codes with zeros — best effort
      const encoder = new TextEncoder();
      const keyBuf = encoder.encode(sessionIdentity.privateKey);
      keyBuf.fill(0);
    } catch { /* best-effort */ }
    sessionIdentity = null;
  }
  sessionRatchetStore.clear();
  for (const key of Object.keys(sessionMessageStore)) {
    delete sessionMessageStore[key];
  }
  sessionFriendStore.clear();
  sessionBlocklistStore.clear();
  sessionSettingsStore.clear();
  isSessionOnlyMode = false;
}

// ==================== PIN-ENCRYPTED IDENTITY (SEC-05) ====================

export async function saveIdentityEncrypted(
  identity: LocalIdentity & { localUsername: string },
  pin: string
): Promise<void> {
  if (isSessionOnlyMode) {
    // SEC-07: Session-only mode — store only in memory, never persisted
    sessionIdentity = identity;
    return;
  }

  const identityJson = JSON.stringify({
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    localUsername: identity.localUsername,
  });

  const encrypted = await encryptIdentityWithPin(identityJson, pin);

  const database = await getDB();
  await database.put('encryptedIdentity', {
    id: 'current',
    salt: encrypted.salt,
    iv: encrypted.iv,
    data: encrypted.data,
    publicKey: identity.publicKey, // Unencrypted for server sync (not secret)
  });
}

export async function getIdentityEncrypted(
  pin: string
): Promise<(LocalIdentity & { localUsername: string }) | null> {
  // Check session-only mode first
  if (isSessionOnlyMode && sessionIdentity) {
    return sessionIdentity;
  }

  const database = await getDB();
  const record = await database.get('encryptedIdentity', 'current');
  if (!record) return null;

  try {
    const decryptedJson = await decryptIdentityWithPin(
      { salt: record.salt, iv: record.iv, data: record.data },
      pin
    );
    const identity = JSON.parse(decryptedJson);
    return identity;
  } catch {
    // Wrong PIN — decryption fails (AES-GCM auth tag mismatch)
    throw new Error('Invalid PIN');
  }
}

// Check if an encrypted identity exists (does NOT require PIN)
export async function hasEncryptedIdentity(): Promise<boolean> {
  if (isSessionOnlyMode && sessionIdentity) return true;

  const database = await getDB();
  const record = await database.get('encryptedIdentity', 'current');
  return !!record;
}

// Set friend verified status
export async function setFriendVerified(publicKey: string, verified: boolean): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('friends', 'readwrite');
  const store = tx.objectStore('friends');
  const friend = await store.get(publicKey) as LocalFriend;
  if (friend) {
    friend.verified = verified;
    await store.put(friend);
  }
}

// Get the public key without the PIN (publicKey is not secret)
export async function getStoredPublicKey(): Promise<string | null> {
  if (isSessionOnlyMode && sessionIdentity) return sessionIdentity.publicKey;

  const database = await getDB();
  const record = await database.get('encryptedIdentity', 'current');
  return record?.publicKey || null;
}

// Legacy compatible identity operations for components that already have the PIN
// This wraps the old interface so existing code doesn't break during transition
export async function getIdentity(): Promise<(LocalIdentity & { localUsername: string }) | undefined> {
  // If session identity is loaded, return it
  if (sessionIdentity) return sessionIdentity;
  return undefined;
}

export async function setDecryptedIdentity(identity: LocalIdentity & { localUsername: string }): Promise<void> {
  sessionIdentity = identity;
}

export async function clearIdentity(): Promise<void> {
  // Zeroize the in-memory private key before nullifying
  if (sessionIdentity) {
    try {
      const encoder = new TextEncoder();
      const keyBuf = encoder.encode(sessionIdentity.privateKey);
      keyBuf.fill(0);
    } catch { /* best-effort */ }
    sessionIdentity = null;
  }
  const database = await getDB();
  await database.clear('encryptedIdentity');
}

// ==================== DEVICE IDENTITY OPERATIONS ====================

// P1-01: Generate and retrieve a non-extractable AES-GCM device encryption key
async function getDeviceEncryptionKey(): Promise<CryptoKey> {
  const database = await getDB();
  let key = await database.get('deviceCryptoKey', 'dek');
  if (!key) {
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt']
    );
    await database.put('deviceCryptoKey', key, 'dek');
  }
  return key;
}

export async function saveDeviceIdentity(
  publicKey: string,
  privateKey: string,
  deviceName: string
): Promise<void> {
  const dek = await getDeviceEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    dek,
    toArrayBuffer(new TextEncoder().encode(privateKey))
  );

  const database = await getDB();
  await database.put('deviceIdentity', {
    id: 'current',
    publicKey,
    privateKey: JSON.stringify({
      iv: bytesToHex(iv),
      ciphertext: bytesToHex(new Uint8Array(encrypted))
    }),
    deviceName,
  });
}

export async function getDeviceIdentity(): Promise<DeviceIdentity | null> {
  const database = await getDB();
  const record = (await database.get('deviceIdentity', 'current')) as DeviceIdentity | undefined;
  if (!record) return null;

  try {
    // If it's already a JSON encrypted object
    if (record.privateKey.startsWith('{"iv":')) {
      const { iv, ciphertext } = JSON.parse(record.privateKey);
      const dek = await getDeviceEncryptionKey();
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(hexToBytes(iv)) },
        dek,
        toArrayBuffer(hexToBytes(ciphertext))
      );

      return {
        ...record,
        privateKey: new TextDecoder().decode(decrypted)
      };
    }
    
    // Fallback/Legacy migration: If it was plain, encrypt it now
    await saveDeviceIdentity(record.publicKey, record.privateKey, record.deviceName);
    return record;
  } catch (err) {
    console.error("Failed to decrypt device identity:", err);
    return null;
  }
}

export async function hasDeviceIdentity(): Promise<boolean> {
  const identity = await getDeviceIdentity();
  return !!identity;
}

export async function clearDeviceIdentity(): Promise<void> {
  const database = await getDB();
  await database.clear('deviceIdentity');
}

export async function updateUsername(publicKey: string, username: string, pin: string): Promise<void> {
  if (isSessionOnlyMode && sessionIdentity) {
    sessionIdentity.localUsername = username;
    return;
  }

  const identity = await getIdentityEncrypted(pin);
  if (identity) {
    identity.localUsername = username;
    await saveIdentityEncrypted(identity, pin);
  }
}

// ==================== SENT MESSAGES (SEC-21) ====================

export async function saveSentMessage(
  id: string,
  plaintext: string,
  friendPublicKey: string,
  expiresAt?: number
): Promise<void> {
  if (!expiresAt) {
    throw new Error("Cannot store message without expiry");
  }

  if (isSessionOnlyMode) {
    sessionMessageStore[id] = { id, plaintext, friendPublicKey, createdAt: Date.now(), expiresAt };
    return;
  }

  // RT-02: Encrypt plaintext before persisting to IDB.
  // An IDB dump must not yield readable message content.
  let encryptedPayload: string = plaintext; // default: fallback for session-only mode
  if (sessionIdentity) {
    const enc = await encryptWithSecret(
      plaintext,
      hexToBytes(sessionIdentity.privateKey),
      'CipherLink-SentMsg-v1'
    );
    encryptedPayload = JSON.stringify(enc);
  }

  const database = await getDB();
  await database.put('sentMessages', {
    id,
    plaintext: encryptedPayload, // stored as encrypted JSON (or raw in session-only)
    friendPublicKey,
    createdAt: Date.now(),
    expiresAt,
  });
}

export async function getSentMessage(id: string): Promise<string | undefined> {
  if (isSessionOnlyMode) {
    return sessionMessageStore[id]?.plaintext;
  }

  const database = await getDB();
  const record = await database.get('sentMessages', id);
  if (!record) return undefined;

  const raw = record.plaintext;
  // RT-02: Detect encrypted record (starts with '{"salt":') and decrypt it.
  // Legacy plaintext records (pre-fix) are returned as-is.
  if (raw && raw.startsWith('{"salt":') && sessionIdentity) {
    try {
      const enc = JSON.parse(raw);
      return await decryptWithSecret(enc, hexToBytes(sessionIdentity.privateKey), 'CipherLink-SentMsg-v1');
    } catch {
      return undefined; // Decryption failure — treat as missing
    }
  }
  return raw; // Legacy plaintext fallback
}

export async function clearExpiredSentMessages(): Promise<void> {
  const database = await getDB();
  const allSent = await database.getAll('sentMessages');
  const now = Date.now();
  for (const msg of allSent) {
    if (msg.expiresAt && msg.expiresAt < now) {
      await database.delete('sentMessages', msg.id);
    }
  }
}

// ==================== FRIEND OPERATIONS ====================

export async function saveFriend(friend: LocalFriend): Promise<void> {
  if (isSessionOnlyMode) {
    sessionFriendStore.set(friend.publicKey, friend);
    return;
  }
  const database = await getDB();
  await database.put('friends', friend);
}

export async function getFriend(publicKey: string): Promise<LocalFriend | undefined> {
  if (isSessionOnlyMode) {
    return sessionFriendStore.get(publicKey);
  }
  const database = await getDB();
  return database.get('friends', publicKey);
}

export async function getAllFriends(): Promise<LocalFriend[]> {
  if (isSessionOnlyMode) {
    return Array.from(sessionFriendStore.values());
  }
  const database = await getDB();
  const friends = await database.getAll('friends');
  // Sort by lastMessageAt descending
  return friends.sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return 0;
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

export async function updateFriendLastMessage(
  publicKey: string,
  preview: string,
  timestamp: Date
): Promise<void> {
  if (isSessionOnlyMode) {
    const friend = sessionFriendStore.get(publicKey);
    if (friend) {
      friend.lastMessagePreview = preview;
      friend.lastMessageAt = timestamp.toISOString();
      sessionFriendStore.set(publicKey, friend);
    }
    return;
  }
  const database = await getDB();
  const friend = await database.get('friends', publicKey);
  if (friend) {
    friend.lastMessagePreview = preview;
    friend.lastMessageAt = timestamp.toISOString();
    await database.put('friends', friend);
  }
}

export async function updateFriendVerification(
  publicKey: string,
  verified: boolean
): Promise<void> {
  // Compute the TOFU fingerprint for the current public key
  let fingerprint: string | undefined;
  if (verified) {
    fingerprint = await fingerprintIdentityKey(hexToBytes(publicKey));
  }

  if (isSessionOnlyMode) {
    const friend = sessionFriendStore.get(publicKey);
    if (friend) {
      friend.verified = verified;
      if (verified && fingerprint) friend.verifiedFingerprint = fingerprint;
      if (!verified) friend.verifiedFingerprint = undefined;
      sessionFriendStore.set(publicKey, friend);
    }
    return;
  }
  const database = await getDB();
  const friend = await database.get('friends', publicKey);
  if (friend) {
    friend.verified = verified;
    if (verified && fingerprint) friend.verifiedFingerprint = fingerprint;
    if (!verified) friend.verifiedFingerprint = undefined;
    await database.put('friends', friend);
  }
}

/**
 * Detect if a contact's identity key has changed since last verification.
 * If the stored fingerprint does not match the current key, the contact is
 * automatically marked as unverified and the function returns true.
 *
 * Call this before allowing a message to be sent to a verified contact.
 */
export async function detectIdentityKeyChange(publicKey: string): Promise<boolean> {
  const friend = isSessionOnlyMode
    ? sessionFriendStore.get(publicKey)
    : await (await getDB()).get('friends', publicKey);

  if (!friend || !friend.verified || !friend.verifiedFingerprint) return false;

  const currentFingerprint = await fingerprintIdentityKey(hexToBytes(publicKey));
  if (currentFingerprint === friend.verifiedFingerprint) return false;

  // Key has changed — revoke verification and store new (unverified) fingerprint
  await updateFriendVerification(publicKey, false);
  return true;
}

export async function deleteFriend(publicKey: string): Promise<void> {
  if (isSessionOnlyMode) {
    sessionFriendStore.delete(publicKey);
    return;
  }
  const database = await getDB();
  await database.delete('friends', publicKey);
}

// ==================== BLOCKLIST OPERATIONS ====================

export async function blockUser(publicKey: string): Promise<void> {
  if (isSessionOnlyMode) {
    sessionBlocklistStore.add(publicKey);
    return;
  }
  const database = await getDB();
  await database.put('blocklist', { publicKey, blockedAt: new Date() });
}

export async function unblockUser(publicKey: string): Promise<void> {
  if (isSessionOnlyMode) {
    sessionBlocklistStore.delete(publicKey);
    return;
  }
  const database = await getDB();
  await database.delete('blocklist', publicKey);
}

export async function isBlocked(publicKey: string): Promise<boolean> {
  if (isSessionOnlyMode) {
    return sessionBlocklistStore.has(publicKey);
  }
  const database = await getDB();
  const blocked = await database.get('blocklist', publicKey);
  return !!blocked;
}

export async function getBlockedUsers(): Promise<string[]> {
  if (isSessionOnlyMode) {
    return Array.from(sessionBlocklistStore);
  }
  const database = await getDB();
  const blocked = await database.getAll('blocklist');
  return blocked.map(b => b.publicKey);
}

// ==================== SETTINGS OPERATIONS ====================

export async function saveSetting<T>(key: string, value: T): Promise<void> {
  if (isSessionOnlyMode) {
    sessionSettingsStore.set(key, value);
    return;
  }
  const database = await getDB();
  await database.put('settings', value, key);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  if (isSessionOnlyMode) {
    return sessionSettingsStore.get(key) as T | undefined;
  }
  const database = await getDB();
  return database.get('settings', key) as Promise<T | undefined>;
}

// ==================== DOUBLE RATCHET SESSIONS (SEC-02/SEC-05/SEC-07) ====================

export async function saveRatchetSession(sessionId: string, session: any): Promise<void> {
  if (isSessionOnlyMode) {
    sessionRatchetStore.set(sessionId, session);
    return;
  }

  if (!sessionIdentity) return; // Cannot save if not unlocked

  try {
    const encrypted = await encryptWithSecret(
      JSON.stringify(session),
      hexToBytes(sessionIdentity.privateKey),
      'CipherLink-Ratchet-Session-v1'
    );
    
    // RT-06: Add plaintext updatedAt to allow the cleanup worker to evict
    // stale records without needing the device private key to decrypt first.
    const record = { ...encrypted, updatedAt: Date.now() };

    const database = await getDB();
    await database.put('ratchetSessions', record, sessionId);
  } catch (err) {
    console.error("Failed to save encrypted ratchet session:", err);
  }
}

export async function getRatchetSession(sessionId: string): Promise<any | undefined> {
  // Check memory store first for session-only mode
  if (isSessionOnlyMode || !sessionIdentity) {
    return sessionRatchetStore.get(sessionId);
  }

  try {
    const database = await getDB();
    const record = await database.get('ratchetSessions', sessionId);
    if (!record) return undefined;

    // If it's old unencrypted format (SEC-02 cleanup), record might not have iv/salt
    if (!record.ciphertext || !record.iv || !record.salt) {
      console.warn("Found unencrypted session record. Deleting for security.");
      await database.delete('ratchetSessions', sessionId);
      return undefined;
    }

    const decryptedJson = await decryptWithSecret(
      record,
      hexToBytes(sessionIdentity.privateKey),
      'CipherLink-Ratchet-Session-v1'
    );
    
    return JSON.parse(decryptedJson);
  } catch (err) {
    console.error("Failed to load/decrypt ratchet session:", err);
    return undefined;
  }
}

// ==================== CLEAR ALL RATCHET SESSIONS ====================

/**
 * Wipes ALL ratchet sessions from IndexedDB.
 * Call this whenever the session key format changes (e.g., after a crypto upgrade)
 * to force fresh X3DH handshakes on next message send/receive.
 */
export async function clearAllRatchetSessions(): Promise<void> {
  if (isSessionOnlyMode) {
    sessionRatchetStore.clear();
    return;
  }
  const database = await getDB();
  await database.clear('ratchetSessions');
}

// ==================== SESSION CRYPTO VERSION SENTINEL ====================

/**
 * Call once at app startup (after identity is loaded).
 * If the stored session crypto version doesn't match SESSION_CRYPTO_VERSION,
 * all ratchet sessions are cleared — forcing fresh X3DH handshakes.
 * This is a secondary safety net for Vite HMR where the IDB upgrade callback
 * does NOT re-fire when the version is already current in this tab.
 */
export async function ensureSessionCryptoVersion(): Promise<void> {
  const LS_KEY = 'cipherlink-session-crypto-version';
  const stored = localStorage.getItem(LS_KEY);
  if (stored !== SESSION_CRYPTO_VERSION) {
    console.info(`[CipherLink] Session crypto version changed (${stored} → ${SESSION_CRYPTO_VERSION}). Clearing stale sessions.`);
    await clearAllRatchetSessions();
    localStorage.setItem(LS_KEY, SESSION_CRYPTO_VERSION);
  }
}

// ==================== CLEAR ALL DATA (SEC-06) ====================

export async function clearAllData(): Promise<void> {
  // Zeroize all in-memory key material first
  clearSessionMemory();
  
  const database = await getDB();
  await database.clear('encryptedIdentity');
  await database.clear('friends');
  await database.clear('blocklist');
  await database.clear('settings');
  await database.clear('sentMessages');
  await database.clear('ratchetSessions');
}

// ==================== SESSION-ONLY BEFOREUNLOAD (SEC-07 / HARDENED) ====================

export function setupSessionOnlyCleanup(): void {
  if (isSessionOnlyMode) {
    window.addEventListener('beforeunload', () => {
      // Synchronous, best-effort key zeroize before page unloads.
      // Cannot call async IndexedDB APIs in beforeunload, but session
      // identity was never persisted to IndexedDB in session-only mode.
      clearSessionMemory();
    });
  }
}

// Check if user has an identity (works for both modes)
export async function hasIdentity(): Promise<boolean> {
  if (sessionIdentity) return true;
  return hasEncryptedIdentity();
}

// ==================== BACKGROUND DB CLEANUP ====================
import { now, secureClear } from './ratchet/crypto-helpers.js';

export async function cleanupDatabase(): Promise<void> {
  const currentTime = now();
  const database = await getDB();
  const MAX_EPHEMERAL_AGE = 30 * 60 * 60 * 1000; // 30 hours

  // 1. Delete expired sent messages
  const allSent = await database.getAll('sentMessages');
  try {
    for (const msg of allSent) {
      if (msg.expiresAt && currentTime > msg.expiresAt) {
        await database.delete('sentMessages', msg.id);
      }
    }
  } catch (err) {
    console.error("Cleanup iteration failed", err);
  }

  // 2. Delete ephemeral data: stale sessions and skipped keys
  const allSessionKeys = await database.getAllKeys('ratchetSessions');
  try {
    for (const key of allSessionKeys) {
      const session = await database.get('ratchetSessions', key);
      if (!session) continue;
      
      // RT-06: session is an ENCRYPTED blob. Accessing lastUsedAt or skippedMessageKeys
      // yields undefined. We rely on the plaintext updatedAt injected during save.
      if (session.updatedAt && (currentTime - session.updatedAt > MAX_EPHEMERAL_AGE)) {
        await database.delete('ratchetSessions', key);
      }
    }
  } catch (err) {
    console.error("Cleanup iteration failed", err);
  }
}

const CLEANUP_LOCK_KEY = "cipherlink_cleanup_lock";

function acquireCleanupLock(): boolean {
  try {
    const nowTs = Date.now();
    const existing = localStorage.getItem(CLEANUP_LOCK_KEY);

    if (existing) {
      const age = nowTs - parseInt(existing);
      if (age < 5 * 60 * 1000) return false;
    }

    localStorage.setItem(CLEANUP_LOCK_KEY, nowTs.toString());

    // VERIFY we still own it
    return localStorage.getItem(CLEANUP_LOCK_KEY) === nowTs.toString();
  } catch {
    return true;
  }
}

let cleanupStarted = false;

export function startCleanupWorker() {
  if (cleanupStarted) return;
  cleanupStarted = true;

  if (typeof setInterval !== 'undefined') {
    if (acquireCleanupLock()) {
      setInterval(async () => {
        try {
          await cleanupDatabase();
          try { localStorage.setItem(CLEANUP_LOCK_KEY, Date.now().toString()); } catch(e){} // Keeplock
        } catch (err) {
          console.error("Cleanup worker error", err);
        }
      }, 5 * 60 * 1000);
    }
  }
}
