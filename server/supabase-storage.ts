import { db } from './db';
import { generateConversationId } from './crypto-utils';
import {
  users,
  friendCodes,
  friends,
  messages,
  blocklist,
  devices,
  identityKeyHistory,
  prekeyBundles,
  deviceChallenges,
  linkingRequests,
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
} from '@shared/schema';
import { eq, and, or, lt, gt, asc, sql } from 'drizzle-orm';
import type { IStorage } from './storage';

const isDev = process.env.NODE_ENV !== 'production';

export class SupabaseStorage implements IStorage {
  // In-memory typing indicators (ephemeral state)
  private typingIndicators: Map<string, number> = new Map();

  // ==================== USERS ====================

  async getUser(publicKey: string): Promise<User | undefined> {
    try {
      const normalizedKey = publicKey.toLowerCase().trim();
      const result = await db.select()
        .from(users)
        .where(eq(users.publicKey, normalizedKey))
        .limit(1);

      return result[0];
    } catch (error) {
      if (isDev) console.error('Error getting user by public key:', error);
      throw error;
    }
  }

  async getUserById(id: string): Promise<User | undefined> {
    try {
      const result = await db.select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return result[0];
    } catch (error) {
      if (isDev) console.error('Error getting user by id:', error);
      throw error;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      // Check if user already exists — idempotent registration
      const existing = await this.getUser(insertUser.publicKey);
      if (existing) {
        // CRIT-B: No longer back-fill devicePublicKey here.
        // Device registration is a separate, challenge-bound operation.
        return existing;
      }

      // Insert new user (publicKey + optional displayName)
      const normalizedKey = insertUser.publicKey.toLowerCase().trim();

      const result = await db.insert(users)
        .values({
          publicKey: normalizedKey,
          displayName: insertUser.displayName || null,
          updatedAt: new Date(),
        })
        .returning();

      return result[0];
    } catch (error) {
      if (isDev) console.error('Error creating user:', error);
      throw error;
    }
  }


  async setUserDevicePublicKey(userPublicKey: string, devicePublicKey: string): Promise<void> {
    try {
      const normalizedUser = userPublicKey.toLowerCase().trim();
      const normalizedDevice = devicePublicKey.toLowerCase().trim();
      // Only update if devicePublicKey is currently NULL — idempotent and safe.
      // sql`"device_public_key" IS NULL` prevents overwriting an existing signing key.
      await db.update(users)
        .set({ devicePublicKey: normalizedDevice, updatedAt: new Date() })
        .where(and(eq(users.publicKey, normalizedUser), sql`"device_public_key" IS NULL`));
    } catch (error) {
      if (isDev) console.error('Error setting user device public key:', error);
      throw error;
    }
  }

  // ==================== FRIEND CODES ====================

  async createFriendCode(insertCode: InsertFriendCode): Promise<FriendCode> {
    try {
      // Ensure expiresAt is a proper Date object
      const expiresAtDate = insertCode.expiresAt instanceof Date
        ? insertCode.expiresAt
        : new Date(insertCode.expiresAt);

      const result = await db.insert(friendCodes)
        .values({
          code: insertCode.code,
          identityPublicKey: insertCode.identityPublicKey,
          expiresAt: expiresAtDate,
          used: false,
          updatedAt: new Date(),
        })
        .returning();

      return result[0];
    } catch (error) {
      if (isDev) console.error('Error creating friend code:', error);
      throw error;
    }
  }

  async getFriendCodeByCode(code: string): Promise<FriendCode | undefined> {
    try {
      // SEC-20: Single consistent query — no debug-only extra query that causes timing oracle
      const now = new Date();
      const result = await db.select()
        .from(friendCodes)
        .where(
          and(
            eq(friendCodes.code, code),
            eq(friendCodes.used, false),
            gt(friendCodes.expiresAt, now)
          )
        )
        .limit(1);

      return result[0];
    } catch (error) {
      if (isDev) console.error('Error getting friend code:', error);
      throw error;
    }
  }

  async markFriendCodeUsed(code: string): Promise<void> {
    try {
      await db.update(friendCodes)
        .set({ 
          used: true,
          updatedAt: new Date(),
        })
        .where(eq(friendCodes.code, code));
    } catch (error) {
      if (isDev) console.error('Error marking friend code as used:', error);
      throw error;
    }
  }

  async deleteExpiredFriendCodes(): Promise<void> {
    try {
      const now = new Date();
      const deleted = await db.delete(friendCodes)
        .where(
          or(
            lt(friendCodes.expiresAt, now),
            eq(friendCodes.used, true)
          )
        )
        .returning({ id: friendCodes.id });

      if (deleted.length > 0 && isDev) {
        console.log(`Cleanup: Deleted ${deleted.length} expired/used friend codes`);
      }
    } catch (error) {
      if (isDev) console.error('Error deleting expired friend codes:', error);
      throw error;
    }
  }

  // ==================== FRIENDS ====================

  async createFriend(insertFriend: InsertFriend): Promise<Friend> {
    try {
      const normalizedUser = insertFriend.userPublicKey.toLowerCase().trim();
      const normalizedFriend = insertFriend.friendPublicKey.toLowerCase().trim();
      const result = await db.insert(friends)
        .values({
          userPublicKey: normalizedUser,
          friendPublicKey: normalizedFriend,
          status: insertFriend.status || 'pending',
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      // If conflict (duplicate friendship), return existing record
      if (result.length === 0) {
        const existing = await db.select()
          .from(friends)
          .where(
            and(
              eq(friends.userPublicKey, normalizedUser),
              eq(friends.friendPublicKey, normalizedFriend)
            )
          )
          .limit(1);
        return existing[0];
      }

      return result[0];
    } catch (error) {
      if (isDev) console.error('Error creating friend:', error);
      throw error;
    }
  }

  async getFriends(publicKey: string): Promise<Friend[]> {
    try {
      // Only return accepted friendships
      const normalizedKey = publicKey.toLowerCase().trim();
      const result = await db.select()
        .from(friends)
        .where(
          and(
            eq(friends.userPublicKey, normalizedKey),
            eq(friends.status, 'accepted')
          )
        );

      return result;
    } catch (error) {
      if (isDev) console.error('Error getting friends:', error);
      throw error;
    }
  }

  async getPendingFriendRequests(publicKey: string): Promise<Friend[]> {
    try {
      const normalizedKey = publicKey.toLowerCase().trim();
      const result = await db.select()
        .from(friends)
        .where(
          and(
            eq(friends.userPublicKey, normalizedKey),
            eq(friends.status, 'pending')
          )
        );

      return result;
    } catch (error) {
      if (isDev) console.error('Error getting pending friend requests:', error);
      throw error;
    }
  }

  async acceptFriendRequest(userPublicKey: string, friendPublicKey: string): Promise<void> {
    try {
      const normalizedUser = userPublicKey.toLowerCase().trim();
      const normalizedFriend = friendPublicKey.toLowerCase().trim();
      await db.update(friends)
        .set({
          status: 'accepted',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(friends.userPublicKey, normalizedUser),
            eq(friends.friendPublicKey, normalizedFriend),
            eq(friends.status, 'pending')
          )
        );
    } catch (error) {
      if (isDev) console.error('Error accepting friend request:', error);
      throw error;
    }
  }

  async declineFriendRequest(userPublicKey: string, friendPublicKey: string): Promise<void> {
    try {
      const normalizedUser = userPublicKey.toLowerCase().trim();
      const normalizedFriend = friendPublicKey.toLowerCase().trim();

      // BUG-FIX (Bug 2): Only delete the requester's OWN pending row.
      // Previously both sides were deleted, which destroyed the friend-code
      // creator's already-accepted friendship entry when the recipient declined.
      // The friend-code creator's `accepted` row must be preserved — their local
      // friend list entry is valid regardless of the other party's decision.
      await db.delete(friends)
        .where(
          and(
            eq(friends.userPublicKey, normalizedUser),
            eq(friends.friendPublicKey, normalizedFriend),
            eq(friends.status, 'pending')
          )
        );
    } catch (error) {
      if (isDev) console.error('Error declining friend request:', error);
      throw error;
    }
  }

  async areFriends(publicKey1: string, publicKey2: string): Promise<boolean> {
    try {
      const k1 = publicKey1.toLowerCase().trim();
      const k2 = publicKey2.toLowerCase().trim();
      const result = await db.select()
        .from(friends)
        .where(
          or(
            and(
              eq(friends.userPublicKey, k1),
              eq(friends.friendPublicKey, k2)
            ),
            and(
              eq(friends.userPublicKey, k2),
              eq(friends.friendPublicKey, k1)
            )
          )
        )
        .limit(1);

      return result.length > 0;
    } catch (error) {
      if (isDev) console.error('Error checking friendship:', error);
      throw error;
    }
  }

  // SEC-FIX-7: Atomic friend code redemption using database transaction
  async redeemFriendCode(code: string, redeemerPublicKey: string): Promise<{ friendPublicKey: string }> {
    const normalizedRedeemer = redeemerPublicKey.toLowerCase().trim();

    return await db.transaction(async (tx) => {
      // 1. Look up friend code — SELECT … FOR UPDATE semantics via transaction
      const codeResult = await tx.select()
        .from(friendCodes)
        .where(
          and(
            eq(friendCodes.code, code),
            eq(friendCodes.used, false),
            gt(friendCodes.expiresAt, new Date())
          )
        )
        .limit(1);

      if (codeResult.length === 0) {
        throw new Error('Invalid or expired code');
      }

      const friendCode = codeResult[0];

      if (friendCode.identityPublicKey === normalizedRedeemer) {
        throw new Error('Cannot add yourself');
      }

      // 2. Check existing friendship
      const existingFriendship = await tx.select()
        .from(friends)
        .where(
          or(
            and(
              eq(friends.userPublicKey, friendCode.identityPublicKey),
              eq(friends.friendPublicKey, normalizedRedeemer)
            ),
            and(
              eq(friends.userPublicKey, normalizedRedeemer),
              eq(friends.friendPublicKey, friendCode.identityPublicKey)
            )
          )
        )
        .limit(1);

      if (existingFriendship.length > 0) {
        throw new Error('Already friends');
      }

      // 3. Mark used — atomic within this transaction
      await tx.update(friendCodes)
        .set({ used: true, updatedAt: new Date() })
        .where(eq(friendCodes.code, code));

      // 4. Create both friendship records
      await tx.insert(friends)
        .values({
          userPublicKey: normalizedRedeemer,
          friendPublicKey: friendCode.identityPublicKey,
          status: 'accepted',
          updatedAt: new Date(),
        })
        .onConflictDoNothing();

      await tx.insert(friends)
        .values({
          userPublicKey: friendCode.identityPublicKey,
          friendPublicKey: normalizedRedeemer,
          status: 'pending',
          updatedAt: new Date(),
        })
        .onConflictDoNothing();

      return { friendPublicKey: friendCode.identityPublicKey };
    });
  }

  // ==================== MESSAGES ====================

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    try {
      const normalizedSender = insertMessage.senderPublicKey.toLowerCase().trim();
      const normalizedReceiver = insertMessage.receiverPublicKey.toLowerCase().trim();
      const result = await db.insert(messages)
        .values({
          senderPublicKey: normalizedSender,
          receiverPublicKey: normalizedReceiver,
          encryptedPayloads: insertMessage.encryptedPayloads,
          ttlSeconds: insertMessage.ttlSeconds,
          expiresAt: new Date(insertMessage.expiresAt),
          conversationId: insertMessage.conversationId || generateConversationId(normalizedSender, normalizedReceiver),
          updatedAt: new Date(),
        })
        .returning();

      return result[0];
    } catch (error: any) {
      if (isDev) console.error('Error creating message:', error);
      throw error;
    }
  }

  async getMessages(userPublicKey: string, friendPublicKey: string): Promise<Message[]> {
    try {
      const now = new Date();
      const normalizedUser = userPublicKey.toLowerCase().trim();
      const normalizedFriend = friendPublicKey.toLowerCase().trim();
      const result = await db.select()
        .from(messages)
        .where(
          and(
            gt(messages.expiresAt, now),
            eq(messages.conversationId, generateConversationId(normalizedUser, normalizedFriend))
          )
        )
        .orderBy(sql`${messages.createdAt} DESC`)
        .limit(50);

      return result;
    } catch (error) {
      if (isDev) console.error('Error getting messages:', error);
      throw error;
    }
  }

  async getAllMessagesForUser(publicKey: string): Promise<Message[]> {
    try {
      const now = new Date();
      const normalizedKey = publicKey.toLowerCase().trim();
      const result = await db.select()
        .from(messages)
        .where(
          and(
            gt(messages.expiresAt, now),
            or(
              eq(messages.senderPublicKey, normalizedKey),
              eq(messages.receiverPublicKey, normalizedKey)
            )
          )
        )
        .orderBy(asc(messages.createdAt));

      return result;
    } catch (error) {
      if (isDev) console.error('Error getting all messages for user:', error);
      throw error;
    }
  }

  async deleteExpiredMessages(): Promise<void> {
    try {
      const now = new Date();
      const deleted = await db.delete(messages)
        .where(lt(messages.expiresAt, now))
        .returning({ id: messages.id });

      if (deleted.length > 0 && isDev) {
        console.log(`Cleanup: Deleted ${deleted.length} expired messages`);
      }
    } catch (error) {
      if (isDev) console.error('Error deleting expired messages:', error);
      throw error;
    }
  }

  async deleteMessage(id: string): Promise<void> {
    try {
      await db.delete(messages)
        .where(eq(messages.id, id));
    } catch (error) {
      if (isDev) console.error('Error deleting message:', error);
      throw error;
    }
  }

  async markMessageAsRead(messageId: string): Promise<void> {
    try {
      await db.update(messages)
        .set({ 
          isRead: true,
          updatedAt: new Date(),
        })
        .where(eq(messages.id, messageId));
    } catch (error) {
      if (isDev) console.error('Error marking message as read:', error);
      throw error;
    }
  }

  async addReaction(messageId: string, userPublicKey: string, emoji: string): Promise<void> {
    try {
      // Get current message
      const result = await db.select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (result.length === 0) return;

      const message = result[0];
      let reactions: Record<string, string> = {};

      // Safely parse reactions JSON - reset to empty object if corrupted
      if (message.reactions) {
        try {
          const parsed = JSON.parse(message.reactions);
          // Validate it's actually an object
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            reactions = parsed;
          }
        } catch (parseError) {
          // Corrupted JSON - reset to empty object
          if (isDev) {
            try {
              console.error('Error parsing reactions JSON, resetting:', parseError);
            } catch {
              // Ignore logging errors
            }
          }
          reactions = {};
        }
      }

      reactions[userPublicKey] = emoji;

      await db.update(messages)
        .set({ 
          reactions: JSON.stringify(reactions),
          updatedAt: new Date(),
        })
        .where(eq(messages.id, messageId));
    } catch (error) {
      if (isDev) {
        try {
          console.error('Error adding reaction:', error);
        } catch {
          // Ignore logging errors
        }
      }
      throw error;
    }
  }

  async removeReaction(messageId: string, userPublicKey: string): Promise<void> {
    try {
      // Get current message
      const result = await db.select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

      if (result.length === 0) return;

      const message = result[0];
      let reactions: Record<string, string> = {};

      // Safely parse reactions JSON - reset to empty object if corrupted
      if (message.reactions) {
        try {
          const parsed = JSON.parse(message.reactions);
          // Validate it's actually an object
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            reactions = parsed;
          }
        } catch (parseError) {
          // Corrupted JSON - reset to empty object
          if (isDev) {
            try {
              console.error('Error parsing reactions JSON, resetting:', parseError);
            } catch {
              // Ignore logging errors
            }
          }
          reactions = {};
        }
      }

      delete reactions[userPublicKey];

      await db.update(messages)
        .set({ 
          reactions: JSON.stringify(reactions),
          updatedAt: new Date(),
        })
        .where(eq(messages.id, messageId));
    } catch (error) {
      if (isDev) {
        try {
          console.error('Error removing reaction:', error);
        } catch {
          // Ignore logging errors
        }
      }
      throw error;
    }
  }



  // ==================== BLOCKLIST ====================

  async blockUser(insertBlock: InsertBlock): Promise<Block> {
    try {
      const normalizedBlocker = insertBlock.blockerPublicKey.toLowerCase().trim();
      const normalizedBlocked = insertBlock.blockedPublicKey.toLowerCase().trim();
      const result = await db.insert(blocklist)
        .values({
          blockerPublicKey: normalizedBlocker,
          blockedPublicKey: normalizedBlocked,
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      // If conflict (already blocked), return existing record
      if (result.length === 0) {
        const existing = await db.select()
          .from(blocklist)
          .where(
            and(
              eq(blocklist.blockerPublicKey, normalizedBlocker),
              eq(blocklist.blockedPublicKey, normalizedBlocked)
            )
          )
          .limit(1);
        return existing[0];
      }

      return result[0];
    } catch (error) {
      if (isDev) console.error('Error blocking user:', error);
      throw error;
    }
  }

  async unblockUser(blockerPublicKey: string, blockedPublicKey: string): Promise<void> {
    try {
      const normalizedBlocker = blockerPublicKey.toLowerCase().trim();
      const normalizedBlocked = blockedPublicKey.toLowerCase().trim();
      await db.delete(blocklist)
        .where(
          and(
            eq(blocklist.blockerPublicKey, normalizedBlocker),
            eq(blocklist.blockedPublicKey, normalizedBlocked)
          )
        );
    } catch (error) {
      if (isDev) console.error('Error unblocking user:', error);
      throw error;
    }
  }

  async isBlocked(blockerPublicKey: string, blockedPublicKey: string): Promise<boolean> {
    try {
      const normalizedBlocker = blockerPublicKey.toLowerCase().trim();
      const normalizedBlocked = blockedPublicKey.toLowerCase().trim();
      const result = await db.select({ id: blocklist.id })
        .from(blocklist)
        .where(
          and(
            eq(blocklist.blockerPublicKey, normalizedBlocker),
            eq(blocklist.blockedPublicKey, normalizedBlocked)
          )
        )
        .limit(1);

      return result.length > 0;
    } catch (error) {
      if (isDev) console.error('Error checking if blocked:', error);
      throw error;
    }
  }

  async getBlockedUsers(publicKey: string): Promise<string[]> {
    try {
      const normalizedKey = publicKey.toLowerCase().trim();
      const result = await db.select({ blockedPublicKey: blocklist.blockedPublicKey })
        .from(blocklist)
        .where(eq(blocklist.blockerPublicKey, normalizedKey));

      return result.map(r => r.blockedPublicKey);
    } catch (error) {
      if (isDev) console.error('Error getting blocked users:', error);
      throw error;
    }
  }

  // ==================== TYPING INDICATORS ====================
  // These remain in-memory as they are ephemeral state

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

  // Cleanup expired typing indicators
  cleanupTypingIndicators(): void {
    const now = Date.now();
    const entries = Array.from(this.typingIndicators.entries());
    for (const [key, expireTime] of entries) {
      if (now > expireTime) {
        this.typingIndicators.delete(key);
      }
    }
  }

  // ==================== DEVICES ====================

  async registerDevice(insertDevice: InsertDevice): Promise<Device> {
    try {
      const normalizedUserKey = insertDevice.userPublicKey.toLowerCase().trim();
      const normalizedDeviceKey = insertDevice.devicePublicKey.toLowerCase().trim();

      // SEC-FIX (Vuln 5.3): Enforce max 5 active devices per user to prevent DoS fanout
      const existingDevices = await this.getDevices(normalizedUserKey);
      const activeCount = existingDevices.filter(d => !d.revoked).length;
      if (activeCount >= 5) {
        throw new Error('Maximum device limit (5) reached. Revoke an existing device first.');
      }

      // SEC-HARDEN: Use onConflictDoNothing to prevent errors if device already registered
      const result = await db.insert(devices)
        .values({
          userPublicKey: normalizedUserKey,
          devicePublicKey: normalizedDeviceKey,
          deviceName: insertDevice.deviceName || null,
          identitySignature: insertDevice.identitySignature || null,
        })
        .onConflictDoNothing()
        .returning();
      
      if (result.length === 0) {
        // Return existing device
        const existing = await this.getDeviceByPublicKey(normalizedDeviceKey);
        return existing!;
      }
      
      return result[0];
    } catch (error) {
      if (isDev) console.error('Error registering device:', error);
      throw error;
    }
  }

  async revokeDevice(devicePublicKey: string): Promise<void> {
    try {
      await db.update(devices)
        .set({ revoked: true })
        .where(eq(devices.devicePublicKey, devicePublicKey));
    } catch (error) {
      if (isDev) console.error('Error revoking device:', error);
      throw error;
    }
  }

  async getDevices(userPublicKey: string): Promise<Device[]> {
    try {
      const normalizedKey = userPublicKey.toLowerCase().trim();
      const result = await db.select()
        .from(devices)
        .where(eq(devices.userPublicKey, normalizedKey))
        .orderBy(asc(devices.createdAt));
      
      return result;
    } catch (error) {
      if (isDev) console.error('Error getting devices:', error);
      throw error;
    }
  }

  async getDeviceByPublicKey(devicePublicKey: string): Promise<Device | undefined> {
    try {
      const normalizedKey = devicePublicKey.toLowerCase().trim();
      const result = await db.select()
        .from(devices)
        .where(eq(devices.devicePublicKey, normalizedKey))
        .limit(1);
      
      return result[0];
    } catch (error) {
      if (isDev) console.error('Error getting device by public key:', error);
      throw error;
    }
  }

  // ==================== IDENTITY KEY ROTATION ====================

  async rotateIdentityKey(userPublicKey: string, newPublicKey: string): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        // 1. Add to history
        await tx.insert(identityKeyHistory)
          .values({
            userPublicKey: newPublicKey,
            oldPublicKey: userPublicKey,
          });

        // 2. Update user public key
        // Note: Since tables reference publicKey, we must update all of them manually
        // because we haven't added ON UPDATE CASCADE yet.
        
        // Order matters for FK constraints if not deferred
        
        // Update devices
        await tx.update(devices)
          .set({ userPublicKey: newPublicKey })
          .where(eq(devices.userPublicKey, userPublicKey));

        // Update friends (both sides)
        await tx.update(friends)
          .set({ userPublicKey: newPublicKey })
          .where(eq(friends.userPublicKey, userPublicKey));
        
        await tx.update(friends)
          .set({ friendPublicKey: newPublicKey })
          .where(eq(friends.friendPublicKey, userPublicKey));

        // Update messages (sender and receiver)
        await tx.update(messages)
          .set({ senderPublicKey: newPublicKey })
          .where(eq(messages.senderPublicKey, userPublicKey));

        // Update messages (receiver)
        await tx.update(messages)
          .set({ receiverPublicKey: newPublicKey })
          .where(eq(messages.receiverPublicKey, userPublicKey));

        // Update blocklist
        await tx.update(blocklist)
          .set({ blockerPublicKey: newPublicKey })
          .where(eq(blocklist.blockerPublicKey, userPublicKey));

        await tx.update(blocklist)
          .set({ blockedPublicKey: newPublicKey })
          .where(eq(blocklist.blockedPublicKey, userPublicKey));

        // Update friend codes
        await tx.update(friendCodes)
          .set({ identityPublicKey: newPublicKey })
          .where(eq(friendCodes.identityPublicKey, userPublicKey));

        // Finally update the user table
        await tx.update(users)
          .set({ 
            publicKey: newPublicKey,
            updatedAt: new Date(),
          })
          .where(eq(users.publicKey, userPublicKey));

        // P1-06: Delete all prekey bundles for the old identity
        await tx.delete(prekeyBundles)
          .where(eq(prekeyBundles.identityPublicKey, userPublicKey));

        // Delete device challenges for the old identity
        await tx.delete(deviceChallenges)
          .where(eq(deviceChallenges.userPublicKey, userPublicKey));
      });
    } catch (error) {
      if (isDev) console.error('Error rotating identity key:', error);
      throw error;
    }
  }

  async getIdentityKeyHistory(userPublicKey: string): Promise<IdentityKeyHistory[]> {
    try {
      const result = await db.select()
        .from(identityKeyHistory)
        .where(
          or(
            eq(identityKeyHistory.userPublicKey, userPublicKey),
            eq(identityKeyHistory.oldPublicKey, userPublicKey)
          )
        )
        .orderBy(sql`${identityKeyHistory.rotatedAt} DESC`);
      
      return result;
    } catch (error) {
      if (isDev) console.error('Error getting identity key history:', error);
      throw error;
    }
  }

  // ==================== PREKEY BUNDLES ====================

  async upsertPrekeyBundle(bundle: InsertPrekeyBundle): Promise<PrekeyBundle> {
    try {
      const result = await db.insert(prekeyBundles)
        .values({
          identityPublicKey: bundle.identityPublicKey.toLowerCase().trim(),
          signedPreKey: bundle.signedPreKey,
          preKeySignature: bundle.preKeySignature,
          expiresAt: bundle.expiresAt,
        })
        .onConflictDoUpdate({
          target: prekeyBundles.identityPublicKey,
          set: {
            signedPreKey: bundle.signedPreKey,
            preKeySignature: bundle.preKeySignature,
            uploadedAt: new Date(),
            expiresAt: bundle.expiresAt,
          },
        })
        .returning();
      return result[0];
    } catch (error) {
      if (isDev) console.error('Error upserting prekey bundle:', error);
      throw error;
    }
  }

  async getPrekeyBundle(identityPublicKey: string): Promise<PrekeyBundle | undefined> {
    try {
      const normalizedKey = identityPublicKey.toLowerCase().trim();
      const now = new Date();
      const result = await db.select()
        .from(prekeyBundles)
        .where(
          and(
            eq(prekeyBundles.identityPublicKey, normalizedKey),
            gt(prekeyBundles.expiresAt, now)
          )
        )
        .limit(1);
      return result[0];
    } catch (error) {
      if (isDev) console.error('Error getting prekey bundle:', error);
      throw error;
    }
  }

  async deleteExpiredPrekeyBundles(): Promise<void> {
    try {
      await db.delete(prekeyBundles)
        .where(lt(prekeyBundles.expiresAt, new Date()));
    } catch (error) {
      if (isDev) console.error('Error deleting expired prekey bundles:', error);
      throw error;
    }
  }

  // ==================== DEVICE CHALLENGES ====================

  async createDeviceChallenge(userPublicKey: string, challenge: string, expiresAt: Date): Promise<DeviceChallenge> {
    try {
      const result = await db.insert(deviceChallenges)
        .values({
          userPublicKey: userPublicKey.toLowerCase().trim(),
          challenge,
          expiresAt,
        })
        .returning();
      return result[0];
    } catch (error) {
      if (isDev) console.error('Error creating device challenge:', error);
      throw error;
    }
  }

  async consumeDeviceChallenge(challenge: string, userPublicKey: string): Promise<DeviceChallenge | undefined> {
    try {
      // Atomically mark as used and return — prevents race conditions
      // P2-06: Moved userPublicKey validation into the WHERE clause (prevents challenge burning by others)
      const now = new Date();
      const result = await db.update(deviceChallenges)
        .set({ used: true })
        .where(
          and(
            eq(deviceChallenges.challenge, challenge),
            eq(deviceChallenges.userPublicKey, userPublicKey.toLowerCase().trim()),
            eq(deviceChallenges.used, false),
            gt(deviceChallenges.expiresAt, now)
          )
        )
        .returning();
      return result[0];
    } catch (error) {
      if (isDev) console.error('Error consuming device challenge:', error);
      throw error;
    }
  }

  // ==================== DEVICE LINKING ====================

  async createLinkingRequest(insertRequest: InsertLinkingRequest): Promise<LinkingRequest> {
    try {
      const result = await db.insert(linkingRequests)
        .values({
          userPublicKey: insertRequest.userPublicKey,
          devicePublicKey: insertRequest.devicePublicKey,
          deviceName: insertRequest.deviceName || null,
          expiresAt: insertRequest.expiresAt,
        })
        .onConflictDoUpdate({
           target: linkingRequests.devicePublicKey,
           set: {
             userPublicKey: insertRequest.userPublicKey,
             deviceName: insertRequest.deviceName || null,
             expiresAt: insertRequest.expiresAt,
             status: 'pending',
             identitySignature: null,
             encryptedIdentity: null,
             createdAt: new Date(),
           }
        })
        .returning();
      return result[0];
    } catch (error) {
      if (isDev) console.error('Error creating linking request:', error);
      throw error;
    }
  }

  async getLinkingRequest(requestId: string): Promise<LinkingRequest | undefined> {
    try {
      const result = await db.select()
        .from(linkingRequests)
        .where(eq(linkingRequests.id, requestId))
        .limit(1);
      return result[0];
    } catch (error) {
      if (isDev) console.error('Error getting linking request:', error);
      throw error;
    }
  }

  async getLinkingRequestByDevice(devicePublicKey: string): Promise<LinkingRequest | undefined> {
    try {
      const result = await db.select()
        .from(linkingRequests)
        .where(eq(linkingRequests.devicePublicKey, devicePublicKey))
        .limit(1);
      return result[0];
    } catch (error) {
      if (isDev) console.error('Error getting linking request by device:', error);
      throw error;
    }
  }

  async getPendingLinkingRequests(userPublicKey: string): Promise<LinkingRequest[]> {
    try {
      const now = new Date();
      return await db.select()
        .from(linkingRequests)
        .where(
          and(
            eq(linkingRequests.userPublicKey, userPublicKey),
            eq(linkingRequests.status, 'pending'),
            gt(linkingRequests.expiresAt, now)
          )
        );
    } catch (error) {
      if (isDev) console.error('Error getting pending linking requests:', error);
      throw error;
    }
  }

  async approveLinkingRequest(requestId: string, identitySignature: string, encryptedIdentity: string): Promise<void> {
    try {
      await db.update(linkingRequests)
        .set({
          status: 'approved',
          identitySignature,
          encryptedIdentity,
        })
        .where(eq(linkingRequests.id, requestId));
    } catch (error) {
      if (isDev) console.error('Error approving linking request:', error);
      throw error;
    }
  }

  async rejectLinkingRequest(requestId: string): Promise<void> {
    try {
      await db.update(linkingRequests)
        .set({ status: 'rejected' })
        .where(eq(linkingRequests.id, requestId));
    } catch (error) {
      if (isDev) console.error('Error rejecting linking request:', error);
      throw error;
    }
  }

  async deleteExpiredLinkingRequests(): Promise<void> {
    try {
      const now = new Date();
      await db.delete(linkingRequests)
        .where(lt(linkingRequests.expiresAt, now));
    } catch (error) {
      if (isDev) console.error('Error deleting expired linking requests:', error);
      throw error;
    }
  }
}
