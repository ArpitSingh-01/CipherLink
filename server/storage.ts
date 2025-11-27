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
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(publicKey: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Friend Codes
  createFriendCode(code: InsertFriendCode): Promise<FriendCode>;
  getFriendCodeByCode(code: string): Promise<FriendCode | undefined>;
  markFriendCodeUsed(code: string): Promise<void>;
  deleteExpiredFriendCodes(): Promise<void>;
  
  // Friends
  createFriend(friend: InsertFriend): Promise<Friend>;
  getFriends(publicKey: string): Promise<Friend[]>;
  areFriends(publicKey1: string, publicKey2: string): Promise<boolean>;
  
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private friendCodes: Map<string, FriendCode>;
  private friends: Map<string, Friend>;
  private messages: Map<string, Message>;
  private blocklist: Map<string, Block>;
  private typingIndicators: Map<string, number>; // key: "userKey:friendKey", value: expireTime

  constructor() {
    this.users = new Map();
    this.friendCodes = new Map();
    this.friends = new Map();
    this.messages = new Map();
    this.blocklist = new Map();
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
    for (const [key, expireTime] of this.typingIndicators.entries()) {
      if (now > expireTime) {
        this.typingIndicators.delete(key);
      }
    }
  }

  // Users
  async getUser(publicKey: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.publicKey === publicKey
    );
  }
  
  async getUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const existingUser = await this.getUser(insertUser.publicKey);
    if (existingUser) {
      return existingUser;
    }
    
    const id = randomUUID();
    const user: User = { 
      id,
      publicKey: insertUser.publicKey,
      devicePublicKey: insertUser.devicePublicKey || null,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
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
      this.friendCodes.set(code, friendCode);
    }
  }
  
  async deleteExpiredFriendCodes(): Promise<void> {
    const now = new Date();
    for (const [code, friendCode] of this.friendCodes.entries()) {
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
      friendName: insertFriend.friendName || null,
      createdAt: new Date(),
    };
    this.friends.set(id, friend);
    return friend;
  }
  
  async getFriends(publicKey: string): Promise<Friend[]> {
    return Array.from(this.friends.values()).filter(
      (friend) => friend.userPublicKey === publicKey
    );
  }
  
  async areFriends(publicKey1: string, publicKey2: string): Promise<boolean> {
    return Array.from(this.friends.values()).some(
      (friend) =>
        (friend.userPublicKey === publicKey1 && friend.friendPublicKey === publicKey2) ||
        (friend.userPublicKey === publicKey2 && friend.friendPublicKey === publicKey1)
    );
  }

  // Messages
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      id,
      senderPublicKey: insertMessage.senderPublicKey,
      receiverPublicKey: insertMessage.receiverPublicKey,
      ciphertext: insertMessage.ciphertext,
      nonce: insertMessage.nonce,
      ephemeralPublicKey: insertMessage.ephemeralPublicKey,
      ttlSeconds: insertMessage.ttlSeconds,
      createdAt: new Date(),
      expiresAt: new Date(insertMessage.expiresAt),
    };
    this.messages.set(id, message);
    return message;
  }
  
  async getMessages(userPublicKey: string, friendPublicKey: string): Promise<Message[]> {
    const now = new Date();
    return Array.from(this.messages.values())
      .filter((msg) => {
        const isConversation = 
          (msg.senderPublicKey === userPublicKey && msg.receiverPublicKey === friendPublicKey) ||
          (msg.senderPublicKey === friendPublicKey && msg.receiverPublicKey === userPublicKey);
        const notExpired = msg.expiresAt > now;
        return isConversation && notExpired;
      })
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  }
  
  async getAllMessagesForUser(publicKey: string): Promise<Message[]> {
    const now = new Date();
    return Array.from(this.messages.values())
      .filter((msg) => {
        const isInvolved = msg.senderPublicKey === publicKey || msg.receiverPublicKey === publicKey;
        const notExpired = msg.expiresAt > now;
        return isInvolved && notExpired;
      })
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  }
  
  async deleteExpiredMessages(): Promise<void> {
    const now = new Date();
    for (const [id, message] of this.messages.entries()) {
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
    }
  }
  
  async addReaction(messageId: string, userPublicKey: string, emoji: string): Promise<void> {
    const message = Array.from(this.messages.values()).find(m => m.id === messageId);
    if (message) {
      const reactions = message.reactions ? JSON.parse(message.reactions) : {};
      reactions[userPublicKey] = emoji;
      message.reactions = JSON.stringify(reactions);
    }
  }
  
  async removeReaction(messageId: string, userPublicKey: string): Promise<void> {
    const message = Array.from(this.messages.values()).find(m => m.id === messageId);
    if (message) {
      const reactions = message.reactions ? JSON.parse(message.reactions) : {};
      delete reactions[userPublicKey];
      message.reactions = JSON.stringify(reactions);
    }
  }

  // Blocklist
  async blockUser(insertBlock: InsertBlock): Promise<Block> {
    const id = randomUUID();
    const block: Block = {
      id,
      blockerPublicKey: insertBlock.blockerPublicKey,
      blockedPublicKey: insertBlock.blockedPublicKey,
      createdAt: new Date(),
    };
    const key = `${insertBlock.blockerPublicKey}:${insertBlock.blockedPublicKey}`;
    this.blocklist.set(key, block);
    return block;
  }
  
  async unblockUser(blockerPublicKey: string, blockedPublicKey: string): Promise<void> {
    const key = `${blockerPublicKey}:${blockedPublicKey}`;
    this.blocklist.delete(key);
  }
  
  async isBlocked(blockerPublicKey: string, blockedPublicKey: string): Promise<boolean> {
    const key = `${blockerPublicKey}:${blockedPublicKey}`;
    return this.blocklist.has(key);
  }
  
  async getBlockedUsers(publicKey: string): Promise<string[]> {
    return Array.from(this.blocklist.values())
      .filter((block) => block.blockerPublicKey === publicKey)
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
}

export const storage = new MemStorage();
