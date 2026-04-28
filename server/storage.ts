import {
  type User,
  type InsertUser,
  type FriendCode,
  type InsertFriendCode,
  type Friend,
  type InsertFriend,
  type Message,
  type InsertMessage,
  type Block,
  type InsertBlock,
  type Device,
  type InsertDevice,
  type IdentityKeyHistory,
  type InsertIdentityKeyHistory,
  type PrekeyBundle,
  type InsertPrekeyBundle,
  type DeviceChallenge,
  type LinkingRequest,
  type InsertLinkingRequest,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { generateConversationId } from "./crypto-utils";

export interface IStorage {
  // Users
  getUser(publicKey: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  /**
   * ONE-TIME MIGRATION: Back-fill user.devicePublicKey for legacy accounts.
   * MUST only be called after the device has been verified in the devices table.
   * Idempotent — silently no-ops if devicePublicKey is already set.
   */
  setUserDevicePublicKey(userPublicKey: string, devicePublicKey: string): Promise<void>;

  // Friend Codes
  createFriendCode(code: InsertFriendCode): Promise<FriendCode>;
  getFriendCodeByCode(code: string): Promise<FriendCode | undefined>;
  markFriendCodeUsed(code: string): Promise<void>;
  deleteExpiredFriendCodes(): Promise<void>;

  // Friends
  createFriend(friend: InsertFriend): Promise<Friend>;
  getFriends(publicKey: string): Promise<Friend[]>;
  getPendingFriendRequests(publicKey: string): Promise<Friend[]>;
  acceptFriendRequest(userPublicKey: string, friendPublicKey: string): Promise<void>;
  declineFriendRequest(userPublicKey: string, friendPublicKey: string): Promise<void>;
  areFriends(publicKey1: string, publicKey2: string): Promise<boolean>;

  // Atomic friend code redemption (FIX 7)
  redeemFriendCode(
    code: string,
    redeemerPublicKey: string
  ): Promise<{ friendPublicKey: string }>;

  // Messages
  createMessage(message: InsertMessage): Promise<Message>;
  getMessages(userPublicKey: string, friendPublicKey: string): Promise<Message[]>;
  getAllMessagesForUser(publicKey: string): Promise<Message[]>;
  deleteExpiredMessages(): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  markMessageAsRead(messageId: string): Promise<void>;
  addReaction(messageId: string, userPublicKey: string, emoji: string): Promise<void>;
  removeReaction(messageId: string, userPublicKey: string): Promise<void>;

  // Blocklist
  blockUser(block: InsertBlock): Promise<Block>;
  unblockUser(blockerPublicKey: string, blockedPublicKey: string): Promise<void>;
  isBlocked(blockerPublicKey: string, blockedPublicKey: string): Promise<boolean>;
  getBlockedUsers(publicKey: string): Promise<string[]>;

  // Typing indicators
  setTyping(userPublicKey: string, friendPublicKey: string): void;
  isTyping(userPublicKey: string, friendPublicKey: string): boolean;

  // Devices
  registerDevice(device: InsertDevice): Promise<Device>;
  revokeDevice(devicePublicKey: string): Promise<void>;
  getDevices(userPublicKey: string): Promise<Device[]>;
  getDeviceByPublicKey(devicePublicKey: string): Promise<Device | undefined>;

  // Identity Key Rotation
  rotateIdentityKey(userPublicKey: string, newPublicKey: string): Promise<void>;
  getIdentityKeyHistory(userPublicKey: string): Promise<IdentityKeyHistory[]>;

  // Prekey Bundles (DB-backed X3DH)
  upsertPrekeyBundle(bundle: InsertPrekeyBundle): Promise<PrekeyBundle>;
  getPrekeyBundle(identityPublicKey: string): Promise<PrekeyBundle | undefined>;
  deleteExpiredPrekeyBundles(): Promise<void>;

  // Device Challenges
  createDeviceChallenge(userPublicKey: string, challenge: string, expiresAt: Date): Promise<DeviceChallenge>;
  consumeDeviceChallenge(challenge: string, userPublicKey: string): Promise<DeviceChallenge | undefined>;

  // Device Linking
  createLinkingRequest(insertRequest: InsertLinkingRequest): Promise<LinkingRequest>;
  getLinkingRequest(requestId: string): Promise<LinkingRequest | undefined>;
  getLinkingRequestByDevice(devicePublicKey: string): Promise<LinkingRequest | undefined>;
  getPendingLinkingRequests(userPublicKey: string): Promise<LinkingRequest[]>;
  approveLinkingRequest(requestId: string, identitySignature: string, encryptedIdentity: string): Promise<void>;
  rejectLinkingRequest(requestId: string): Promise<void>;
  deleteExpiredLinkingRequests(): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private friendCodes: Map<string, FriendCode>;
  private friends: Map<string, Friend>;
  private messages: Map<string, Message>;
  private blocklist: Map<string, Block>;
  private devices: Map<string, Device>;
  private identityKeyHistory: Map<string, IdentityKeyHistory>;
  private typingIndicators: Map<string, number>; // key: "userKey:friendKey", value: expireTime

  constructor() {
    this.users = new Map();
    this.friendCodes = new Map();
    this.friends = new Map();
    this.messages = new Map();
    this.blocklist = new Map();
    this.devices = new Map();
    this.identityKeyHistory = new Map();
    this.typingIndicators = new Map();

    // Set up cleanup interval for expired messages and codes
    setInterval(() => {
      this.deleteExpiredMessages();
      this.deleteExpiredFriendCodes();
      this.cleanupTypingIndicators();
    }, 30000); // Every 30 seconds
  }

  private cleanupTypingIndicators(): void {
    const now = Date.now();
    const entries = Array.from(this.typingIndicators.entries());
    for (const [key, expireTime] of entries) {
      if (now > expireTime) {
        this.typingIndicators.delete(key);
      }
    }
  }

  // Users
  async getUser(publicKey: string): Promise<User | undefined> {
    const normalizedKey = publicKey.toLowerCase().trim();
    return Array.from(this.users.values()).find(
      (user) => user.publicKey === normalizedKey
    );
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const normalizedKey = insertUser.publicKey.toLowerCase().trim();

    // CRIT-B: idempotent — return existing user; no device back-fill here.
    const existingUser = await this.getUser(normalizedKey);
    if (existingUser) {
      return existingUser;
    }

    const id = randomUUID();
    const user: User = {
      id,
      publicKey: normalizedKey,
      devicePublicKey: null,
      displayName: insertUser.displayName || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }


  async setUserDevicePublicKey(userPublicKey: string, devicePublicKey: string): Promise<void> {
    const normalizedUser = userPublicKey.toLowerCase().trim();
    const normalizedDevice = devicePublicKey.toLowerCase().trim();
    const user = Array.from(this.users.values()).find(u => u.publicKey === normalizedUser);
    if (user && !user.devicePublicKey) {
      user.devicePublicKey = normalizedDevice;
      user.updatedAt = new Date();
    }
    // Idempotent: no-op if already set
  }

  // Friend Codes
  async createFriendCode(insertCode: InsertFriendCode): Promise<FriendCode> {
    const id = randomUUID();
    const friendCode: FriendCode = {
      id,
      code: insertCode.code,
      identityPublicKey: insertCode.identityPublicKey,
      expiresAt: new Date(insertCode.expiresAt),
      used: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.friendCodes.set(insertCode.code, friendCode);
    return friendCode;
  }

  async getFriendCodeByCode(code: string): Promise<FriendCode | undefined> {
    const friendCode = this.friendCodes.get(code);
    if (!friendCode) return undefined;

    // Check if expired or used
    if (friendCode.used || new Date() > friendCode.expiresAt) {
      return undefined;
    }

    return friendCode;
  }

  async markFriendCodeUsed(code: string): Promise<void> {
    const friendCode = this.friendCodes.get(code);
    if (friendCode) {
      friendCode.used = true;
      friendCode.updatedAt = new Date();
      this.friendCodes.set(code, friendCode);
    }
  }

  async deleteExpiredFriendCodes(): Promise<void> {
    const now = new Date();
    const entries = Array.from(this.friendCodes.entries());
    for (const [code, friendCode] of entries) {
      if (now > friendCode.expiresAt || friendCode.used) {
        this.friendCodes.delete(code);
      }
    }
  }

  // Friends
  async createFriend(insertFriend: InsertFriend): Promise<Friend> {
    const id = randomUUID();
    const friend: Friend = {
      id,
      userPublicKey: insertFriend.userPublicKey,
      friendPublicKey: insertFriend.friendPublicKey,
      status: insertFriend.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.friends.set(id, friend);
    return friend;
  }

  async getFriends(publicKey: string): Promise<Friend[]> {
    return Array.from(this.friends.values()).filter(
      (friend) => friend.userPublicKey === publicKey && friend.status === 'accepted'
    );
  }

  async getPendingFriendRequests(publicKey: string): Promise<Friend[]> {
    return Array.from(this.friends.values()).filter(
      (friend) => friend.userPublicKey === publicKey && friend.status === 'pending'
    );
  }

  async acceptFriendRequest(userPublicKey: string, friendPublicKey: string): Promise<void> {
    const friend = Array.from(this.friends.values()).find(
      (f) => f.userPublicKey === userPublicKey && f.friendPublicKey === friendPublicKey && f.status === 'pending'
    );
    if (friend) {
      friend.status = 'accepted';
      friend.updatedAt = new Date();
    }
  }

  async declineFriendRequest(userPublicKey: string, friendPublicKey: string): Promise<void> {
    // BUG-FIX (Bug 2): Only remove the requester's OWN pending entry.
    // Deleting both sides would destroy the friend-code creator's accepted row.
    const toDelete = Array.from(this.friends.entries()).filter(
      ([_, f]) =>
        f.userPublicKey === userPublicKey &&
        f.friendPublicKey === friendPublicKey &&
        f.status === 'pending'
    );
    for (const [id] of toDelete) {
      this.friends.delete(id);
    }
  }

  async areFriends(publicKey1: string, publicKey2: string): Promise<boolean> {
    const k1 = publicKey1.toLowerCase().trim();
    const k2 = publicKey2.toLowerCase().trim();
    return Array.from(this.friends.values()).some(
      (friend) =>
        (friend.userPublicKey === k1 && friend.friendPublicKey === k2) ||
        (friend.userPublicKey === k2 && friend.friendPublicKey === k1)
    );
  }

  // SEC-FIX-7: Atomic friend code redemption (single-threaded in-memory, no race conditions)
  async redeemFriendCode(code: string, redeemerPublicKey: string): Promise<{ friendPublicKey: string }> {
    const friendCode = this.friendCodes.get(code);
    if (!friendCode || friendCode.used || new Date() > friendCode.expiresAt) {
      throw new Error('Invalid or expired code');
    }
    if (friendCode.identityPublicKey === redeemerPublicKey) {
      throw new Error('Cannot add yourself');
    }
    // Check if already friends
    const alreadyFriends = await this.areFriends(friendCode.identityPublicKey, redeemerPublicKey);
    if (alreadyFriends) {
      throw new Error('Already friends');
    }

    // Mark used
    friendCode.used = true;
    friendCode.updatedAt = new Date();
    this.friendCodes.set(code, friendCode);

    // Create both friendship records
    await this.createFriend({ userPublicKey: redeemerPublicKey, friendPublicKey: friendCode.identityPublicKey, status: 'accepted' });
    await this.createFriend({ userPublicKey: friendCode.identityPublicKey, friendPublicKey: redeemerPublicKey, status: 'pending' });

    return { friendPublicKey: friendCode.identityPublicKey };
  }

  // Messages
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const normalizedSender = insertMessage.senderPublicKey.toLowerCase().trim();
    const normalizedReceiver = insertMessage.receiverPublicKey.toLowerCase().trim();
    const message: Message = {
      id,
      senderPublicKey: normalizedSender,
      receiverPublicKey: normalizedReceiver,
      encryptedPayloads: insertMessage.encryptedPayloads,
      ttlSeconds: insertMessage.ttlSeconds,
      conversationId: insertMessage.conversationId || generateConversationId(normalizedSender, normalizedReceiver),
      isRead: false,
      reactions: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(insertMessage.expiresAt),
    };
    this.messages.set(id, message);
    return message;
  }

  async getMessages(userPublicKey: string, friendPublicKey: string): Promise<Message[]> {
    const now = new Date();
    const normalizedUser = userPublicKey.toLowerCase().trim();
    const normalizedFriend = friendPublicKey.toLowerCase().trim();
    return Array.from(this.messages.values())
      .filter((msg) => {
        const isConversation =
          (msg.senderPublicKey === normalizedUser && msg.receiverPublicKey === normalizedFriend) ||
          (msg.senderPublicKey === normalizedFriend && msg.receiverPublicKey === normalizedUser);
        const notExpired = msg.expiresAt > now;
        return isConversation && notExpired;
      })
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  }

  async getAllMessagesForUser(publicKey: string): Promise<Message[]> {
    const now = new Date();
    const normalizedKey = publicKey.toLowerCase().trim();
    return Array.from(this.messages.values())
      .filter((msg) => {
        const isInvolved = msg.senderPublicKey === normalizedKey || msg.receiverPublicKey === normalizedKey;
        const notExpired = msg.expiresAt > now;
        return isInvolved && notExpired;
      })
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  }

  async deleteExpiredMessages(): Promise<void> {
    const now = new Date();
    const entries = Array.from(this.messages.entries());
    for (const [id, message] of entries) {
      if (now > message.expiresAt) {
        this.messages.delete(id);
      }
    }
  }

  async deleteMessage(id: string): Promise<void> {
    this.messages.delete(id);
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    const message = Array.from(this.messages.values()).find(m => m.id === messageId);
    if (message) {
      message.isRead = true;
      message.updatedAt = new Date();
    }
  }

  async addReaction(messageId: string, userPublicKey: string, emoji: string): Promise<void> {
    const message = Array.from(this.messages.values()).find(m => m.id === messageId);
    if (message) {
      let reactions: Record<string, string> = {};
      if (message.reactions) {
        try { reactions = JSON.parse(message.reactions); } catch { reactions = {}; }
      }
      reactions[userPublicKey] = emoji;
      message.reactions = JSON.stringify(reactions);
      message.updatedAt = new Date();
    }
  }

  async removeReaction(messageId: string, userPublicKey: string): Promise<void> {
    const message = Array.from(this.messages.values()).find(m => m.id === messageId);
    if (message) {
      let reactions: Record<string, string> = {};
      if (message.reactions) {
        try { reactions = JSON.parse(message.reactions); } catch { reactions = {}; }
      }
      delete reactions[userPublicKey];
      message.reactions = JSON.stringify(reactions);
      message.updatedAt = new Date();
    }
  }



  // Blocklist
  async blockUser(insertBlock: InsertBlock): Promise<Block> {
    const id = randomUUID();
    const normalizedBlocker = insertBlock.blockerPublicKey.toLowerCase().trim();
    const normalizedBlocked = insertBlock.blockedPublicKey.toLowerCase().trim();
    const block: Block = {
      id,
      blockerPublicKey: normalizedBlocker,
      blockedPublicKey: normalizedBlocked,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const key = `${normalizedBlocker}:${normalizedBlocked}`;
    this.blocklist.set(key, block);
    return block;
  }

  async unblockUser(blockerPublicKey: string, blockedPublicKey: string): Promise<void> {
    const key = `${blockerPublicKey.toLowerCase().trim()}:${blockedPublicKey.toLowerCase().trim()}`;
    this.blocklist.delete(key);
  }

  async isBlocked(blockerPublicKey: string, blockedPublicKey: string): Promise<boolean> {
    const key = `${blockerPublicKey.toLowerCase().trim()}:${blockedPublicKey.toLowerCase().trim()}`;
    return this.blocklist.has(key);
  }

  async getBlockedUsers(publicKey: string): Promise<string[]> {
    const normalizedKey = publicKey.toLowerCase().trim();
    return Array.from(this.blocklist.values())
      .filter((block) => block.blockerPublicKey === normalizedKey)
      .map((block) => block.blockedPublicKey);
  }

  // Typing indicators
  setTyping(userPublicKey: string, friendPublicKey: string): void {
    const key = `${userPublicKey}:${friendPublicKey}`;
    this.typingIndicators.set(key, Date.now() + 3000); // 3 second timeout
  }

  isTyping(userPublicKey: string, friendPublicKey: string): boolean {
    const key = `${userPublicKey}:${friendPublicKey}`;
    const expireTime = this.typingIndicators.get(key);
    if (!expireTime) return false;
    if (Date.now() > expireTime) {
      this.typingIndicators.delete(key);
      return false;
    }
    return true;
  }

  // Devices
  async registerDevice(insertDevice: InsertDevice): Promise<Device> {
    const normalizedUserKey = insertDevice.userPublicKey.toLowerCase().trim();
    const normalizedDeviceKey = insertDevice.devicePublicKey.toLowerCase().trim();

    // SEC-FIX (Vuln 5.3): Enforce max 5 active devices per user to prevent DoS fanout
    const existingDevices = await this.getDevices(normalizedUserKey);
    const activeCount = existingDevices.filter(d => !d.revoked).length;
    if (activeCount >= 5) {
      throw new Error('Maximum device limit (5) reached. Revoke an existing device first.');
    }

    const id = randomUUID();
    const device: Device = {
      deviceId: id,
      userPublicKey: normalizedUserKey,
      devicePublicKey: normalizedDeviceKey,
      deviceName: insertDevice.deviceName || null,
      identitySignature: insertDevice.identitySignature || null,
      createdAt: new Date(),
      revoked: false,
    };
    this.devices.set(normalizedDeviceKey, device);
    return device;
  }

  async revokeDevice(devicePublicKey: string): Promise<void> {
    const device = this.devices.get(devicePublicKey);
    if (device) {
      device.revoked = true;
      this.devices.set(devicePublicKey, device);
    }
  }

  async getDevices(userPublicKey: string): Promise<Device[]> {
    const normalizedKey = userPublicKey.toLowerCase().trim();
    return Array.from(this.devices.values())
      .filter(d => d.userPublicKey === normalizedKey)
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  }

  async getDeviceByPublicKey(devicePublicKey: string): Promise<Device | undefined> {
    const normalizedKey = devicePublicKey.toLowerCase().trim();
    return this.devices.get(normalizedKey);
  }

  // Identity Key Rotation
  async rotateIdentityKey(userPublicKey: string, newPublicKey: string): Promise<void> {
    const user = await this.getUser(userPublicKey);
    if (user) {
      // 1. Add to history
      const id = randomUUID();
      const history: IdentityKeyHistory = {
        id,
        userPublicKey: newPublicKey,
        oldPublicKey: userPublicKey,
        rotatedAt: new Date(),
      };
      this.identityKeyHistory.set(id, history);

      // 2. Update user
      user.publicKey = newPublicKey;
      user.updatedAt = new Date();
      
      // 3. Update all referencing objects in memory
      for (const friend of Array.from(this.friends.values())) {
        if (friend.userPublicKey === userPublicKey) friend.userPublicKey = newPublicKey;
        if (friend.friendPublicKey === userPublicKey) friend.friendPublicKey = newPublicKey;
      }
      for (const msg of Array.from(this.messages.values())) {
        if (msg.senderPublicKey === userPublicKey) msg.senderPublicKey = newPublicKey;
        if (msg.receiverPublicKey === userPublicKey) msg.receiverPublicKey = newPublicKey;
      }
      for (const device of Array.from(this.devices.values())) {
        if (device.userPublicKey === userPublicKey) device.userPublicKey = newPublicKey;
      }
      for (const code of Array.from(this.friendCodes.values())) {
        if (code.identityPublicKey === userPublicKey) code.identityPublicKey = newPublicKey;
      }
      for (const block of Array.from(this.blocklist.values())) {
        if (block.blockerPublicKey === userPublicKey) block.blockerPublicKey = newPublicKey;
        if (block.blockedPublicKey === userPublicKey) block.blockedPublicKey = newPublicKey;
      }
      for (const [key, bundle] of Array.from(this.prekeyBundles.entries())) {
        if (bundle.identityPublicKey === userPublicKey) this.prekeyBundles.delete(key);
      }
      for (const [key, req] of Array.from(this.deviceChallenges.entries())) {
        if (req.userPublicKey === userPublicKey) this.deviceChallenges.delete(key);
      }
    }
  }

  async getIdentityKeyHistory(userPublicKey: string): Promise<IdentityKeyHistory[]> {
    return Array.from(this.identityKeyHistory.values())
      .filter(h => h.userPublicKey === userPublicKey || h.oldPublicKey === userPublicKey)
      .sort((a, b) => b.rotatedAt!.getTime() - a.rotatedAt!.getTime());
  }

  // ─── Prekey Bundles ─────────────────────────────────────────────────────────

  private prekeyBundles: Map<string, PrekeyBundle> = new Map();

  async upsertPrekeyBundle(bundle: InsertPrekeyBundle): Promise<PrekeyBundle> {
    const existing = this.prekeyBundles.get(bundle.identityPublicKey);
    const record: PrekeyBundle = {
      id: existing?.id ?? randomUUID(),
      identityPublicKey: bundle.identityPublicKey,
      signedPreKey: bundle.signedPreKey,
      preKeySignature: bundle.preKeySignature,
      uploadedAt: new Date(),
      expiresAt: bundle.expiresAt,
    };
    this.prekeyBundles.set(bundle.identityPublicKey, record);
    return record;
  }

  async getPrekeyBundle(identityPublicKey: string): Promise<PrekeyBundle | undefined> {
    const record = this.prekeyBundles.get(identityPublicKey);
    if (!record) return undefined;
    if (record.expiresAt < new Date()) {
      this.prekeyBundles.delete(identityPublicKey);
      return undefined;
    }
    return record;
  }

  async deleteExpiredPrekeyBundles(): Promise<void> {
    const now = new Date();
    for (const [key, record] of Array.from(this.prekeyBundles.entries())) {
      if (record.expiresAt < now) this.prekeyBundles.delete(key);
    }
  }

  // ─── Device Challenges ──────────────────────────────────────────────────────

  private deviceChallenges: Map<string, DeviceChallenge> = new Map();

  async createDeviceChallenge(userPublicKey: string, challenge: string, expiresAt: Date): Promise<DeviceChallenge> {
    const record: DeviceChallenge = {
      id: randomUUID(),
      userPublicKey,
      challenge,
      expiresAt,
      used: false,
      createdAt: new Date(),
    };
    this.deviceChallenges.set(challenge, record);
    return record;
  }

  async consumeDeviceChallenge(challenge: string, userPublicKey: string): Promise<DeviceChallenge | undefined> {
    const record = this.deviceChallenges.get(challenge);
    if (!record || record.used || record.expiresAt < new Date() || record.userPublicKey !== userPublicKey) {
      this.deviceChallenges.delete(challenge);
      return undefined;
    }
    record.used = true;
    this.deviceChallenges.set(challenge, record);
    return record;
  }

  // ─── Device Linking ─────────────────────────────────────────────────────────

  private linkingRequests: Map<string, LinkingRequest> = new Map();

  async createLinkingRequest(insertRequest: InsertLinkingRequest): Promise<LinkingRequest> {
    const id = randomUUID();
    const record: LinkingRequest = {
      id,
      userPublicKey: insertRequest.userPublicKey,
      devicePublicKey: insertRequest.devicePublicKey,
      deviceName: insertRequest.deviceName || null,
      expiresAt: insertRequest.expiresAt,
      status: 'pending',
      identitySignature: null,
      encryptedIdentity: null,
      createdAt: new Date(),
    };
    this.linkingRequests.set(id, record);
    return record;
  }

  async getLinkingRequest(requestId: string): Promise<LinkingRequest | undefined> {
    return this.linkingRequests.get(requestId);
  }

  async getLinkingRequestByDevice(devicePublicKey: string): Promise<LinkingRequest | undefined> {
    return Array.from(this.linkingRequests.values()).find(r => r.devicePublicKey === devicePublicKey);
  }

  async getPendingLinkingRequests(userPublicKey: string): Promise<LinkingRequest[]> {
    const now = new Date();
    return Array.from(this.linkingRequests.values()).filter(r => 
      r.userPublicKey === userPublicKey && 
      r.status === 'pending' && 
      r.expiresAt > now
    );
  }

  async approveLinkingRequest(requestId: string, identitySignature: string, encryptedIdentity: string): Promise<void> {
    const record = this.linkingRequests.get(requestId);
    if (record) {
      record.status = 'approved';
      record.identitySignature = identitySignature;
      record.encryptedIdentity = encryptedIdentity;
      this.linkingRequests.set(requestId, record);
    }
  }

  async rejectLinkingRequest(requestId: string): Promise<void> {
    const record = this.linkingRequests.get(requestId);
    if (record) {
      record.status = 'rejected';
      this.linkingRequests.set(requestId, record);
    }
  }

  async deleteExpiredLinkingRequests(): Promise<void> {
    const now = new Date();
    for (const [id, record] of Array.from(this.linkingRequests.entries())) {
      if (record.expiresAt < now) this.linkingRequests.delete(id);
    }
  }
}

import { SupabaseStorage } from './supabase-storage';

// Use SupabaseStorage for persistent database storage
// MemStorage is kept for reference and testing purposes
export const storage: IStorage = new SupabaseStorage();
