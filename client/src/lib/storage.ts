import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LocalIdentity, LocalFriend } from '@shared/schema';

interface CipherLinkDB extends DBSchema {
  identity: {
    key: string;
    value: {
      publicKey: string;
      privateKey: string;
      recoveryPhrase: string;
      localUsername: string;
    };
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
}

let db: IDBPDatabase<CipherLinkDB> | null = null;

async function getDB(): Promise<IDBPDatabase<CipherLinkDB>> {
  if (db) return db;
  
  db = await openDB<CipherLinkDB>('cipherlink', 1, {
    upgrade(database) {
      // Identity store
      database.createObjectStore('identity', { keyPath: 'publicKey' });
      
      // Friends store
      const friendsStore = database.createObjectStore('friends', { keyPath: 'publicKey' });
      friendsStore.createIndex('by-lastMessage', 'lastMessageAt');
      
      // Blocklist store
      database.createObjectStore('blocklist', { keyPath: 'publicKey' });
      
      // Settings store
      database.createObjectStore('settings');
    },
  });
  
  return db;
}

// Identity operations
export async function saveIdentity(identity: LocalIdentity & { localUsername: string }): Promise<void> {
  const database = await getDB();
  await database.put('identity', identity);
}

export async function getIdentity(): Promise<(LocalIdentity & { localUsername: string }) | undefined> {
  const database = await getDB();
  const identities = await database.getAll('identity');
  return identities[0];
}

export async function updateUsername(publicKey: string, username: string): Promise<void> {
  const database = await getDB();
  const identity = await database.get('identity', publicKey);
  if (identity) {
    identity.localUsername = username;
    await database.put('identity', identity);
  }
}

export async function clearIdentity(): Promise<void> {
  const database = await getDB();
  await database.clear('identity');
}

// Friend operations
export async function saveFriend(friend: LocalFriend): Promise<void> {
  const database = await getDB();
  await database.put('friends', friend);
}

export async function getFriend(publicKey: string): Promise<LocalFriend | undefined> {
  const database = await getDB();
  return database.get('friends', publicKey);
}

export async function getAllFriends(): Promise<LocalFriend[]> {
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
  const database = await getDB();
  const friend = await database.get('friends', publicKey);
  if (friend) {
    friend.lastMessagePreview = preview;
    friend.lastMessageAt = timestamp;
    await database.put('friends', friend);
  }
}

export async function deleteFriend(publicKey: string): Promise<void> {
  const database = await getDB();
  await database.delete('friends', publicKey);
}

// Blocklist operations
export async function blockUser(publicKey: string): Promise<void> {
  const database = await getDB();
  await database.put('blocklist', { publicKey, blockedAt: new Date() });
}

export async function unblockUser(publicKey: string): Promise<void> {
  const database = await getDB();
  await database.delete('blocklist', publicKey);
}

export async function isBlocked(publicKey: string): Promise<boolean> {
  const database = await getDB();
  const blocked = await database.get('blocklist', publicKey);
  return !!blocked;
}

export async function getBlockedUsers(): Promise<string[]> {
  const database = await getDB();
  const blocked = await database.getAll('blocklist');
  return blocked.map(b => b.publicKey);
}

// Settings operations
export async function saveSetting<T>(key: string, value: T): Promise<void> {
  const database = await getDB();
  await database.put('settings', value, key);
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const database = await getDB();
  return database.get('settings', key) as Promise<T | undefined>;
}

// Clear all data
export async function clearAllData(): Promise<void> {
  const database = await getDB();
  await database.clear('identity');
  await database.clear('friends');
  await database.clear('blocklist');
  await database.clear('settings');
}

// Check if user has an identity
export async function hasIdentity(): Promise<boolean> {
  const identity = await getIdentity();
  return !!identity;
}
