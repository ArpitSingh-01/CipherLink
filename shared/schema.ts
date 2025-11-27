import { pgTable, text, varchar, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Users table - stores only public keys (no usernames, no passwords)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  publicKey: text("public_key").notNull().unique(),
  devicePublicKey: text("device_public_key"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  publicKey: true,
  devicePublicKey: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Friend codes - one-time 8-character codes for connecting
export const friendCodes = pgTable("friend_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  identityPublicKey: text("identity_public_key").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFriendCodeSchema = createInsertSchema(friendCodes).pick({
  code: true,
  identityPublicKey: true,
  expiresAt: true,
});

export type InsertFriendCode = z.infer<typeof insertFriendCodeSchema>;
export type FriendCode = typeof friendCodes.$inferSelect;

// Friends - mutual friendships
export const friends = pgTable("friends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userPublicKey: text("user_public_key").notNull(),
  friendPublicKey: text("friend_public_key").notNull(),
  friendName: text("friend_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFriendSchema = createInsertSchema(friends).pick({
  userPublicKey: true,
  friendPublicKey: true,
  friendName: true,
});

export type InsertFriend = z.infer<typeof insertFriendSchema>;
export type Friend = typeof friends.$inferSelect;

// Messages - encrypted with TTL
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderPublicKey: text("sender_public_key").notNull(),
  receiverPublicKey: text("receiver_public_key").notNull(),
  ciphertext: text("ciphertext").notNull(),
  nonce: text("nonce").notNull(),
  ephemeralPublicKey: text("ephemeral_public_key").notNull(),
  ttlSeconds: integer("ttl_seconds").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  senderPublicKey: true,
  receiverPublicKey: true,
  ciphertext: true,
  nonce: true,
  ephemeralPublicKey: true,
  ttlSeconds: true,
  expiresAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Blocklist
export const blocklist = pgTable("blocklist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blockerPublicKey: text("blocker_public_key").notNull(),
  blockedPublicKey: text("blocked_public_key").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBlockSchema = createInsertSchema(blocklist).pick({
  blockerPublicKey: true,
  blockedPublicKey: true,
});

export type InsertBlock = z.infer<typeof insertBlockSchema>;
export type Block = typeof blocklist.$inferSelect;

// TTL options for messages (in seconds)
export const TTL_OPTIONS = [
  { label: "30 seconds", value: 30 },
  { label: "5 minutes", value: 300 },
  { label: "1 hour", value: 3600 },
  { label: "6 hours", value: 21600 },
  { label: "12 hours", value: 43200 },
  { label: "24 hours", value: 86400 },
] as const;

export const DEFAULT_TTL = 86400; // 24 hours

// Frontend-only types for local storage
export interface LocalIdentity {
  publicKey: string;
  privateKey: string;
  recoveryPhrase: string;
}

export interface LocalFriend {
  publicKey: string;
  displayName: string;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
}

export interface DecryptedMessage {
  id: string;
  senderPublicKey: string;
  receiverPublicKey: string;
  plaintext: string;
  ttlSeconds: number;
  createdAt: Date;
  expiresAt: Date;
  isMine: boolean;
}
