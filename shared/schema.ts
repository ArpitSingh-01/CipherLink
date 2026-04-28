import { pgTable, text, varchar, boolean, integer, timestamp, index, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Users table - stores only public keys (no usernames, no passwords)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  publicKey: text("public_key").notNull().unique(),
  devicePublicKey: text("device_public_key"),
  displayName: text("display_name"), // User's self-chosen public name (not relationship metadata)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  publicKeyIdx: index("users_public_key_idx").on(table.publicKey),
}));

// CRIT-B: InsertUser deliberately only carries publicKey.
// Device registration is a SEPARATE, challenge-bound operation.
export const insertUserSchema = createInsertSchema(users).pick({
  publicKey: true,
  displayName: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Friend codes - one-time 8-character codes for connecting
export const friendCodes = pgTable("friend_codes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  identityPublicKey: text("identity_public_key").notNull().references(() => users.publicKey, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  codeIdx: index("friend_codes_code_idx").on(table.code),
  expiresAtIdx: index("friend_codes_expires_at_idx").on(table.expiresAt),
}));

export const insertFriendCodeSchema = createInsertSchema(friendCodes).pick({
  code: true,
  identityPublicKey: true,
  expiresAt: true,
});

export type InsertFriendCode = z.infer<typeof insertFriendCodeSchema>;
export type FriendCode = typeof friendCodes.$inferSelect;

// Friends - mutual friendships with status
// FIX 5: friendName removed — personal relationship metadata ("Mom", "Boss")
// must only be stored locally on-device, never on the server
export const friends = pgTable("friends", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userPublicKey: text("user_public_key").notNull().references(() => users.publicKey, { onDelete: "cascade" }),
  friendPublicKey: text("friend_public_key").notNull().references(() => users.publicKey, { onDelete: "cascade" }),
  status: text("status").notNull().default('pending'), // 'pending' or 'accepted'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userPublicKeyIdx: index("friends_user_public_key_idx").on(table.userPublicKey),
  friendPublicKeyIdx: index("friends_friend_public_key_idx").on(table.friendPublicKey),
  userFriendUniqueIdx: uniqueIndex("friends_user_friend_unique").on(table.userPublicKey, table.friendPublicKey),
}));

export const insertFriendSchema = createInsertSchema(friends).pick({
  userPublicKey: true,
  friendPublicKey: true,
  status: true,
});

export type InsertFriend = z.infer<typeof insertFriendSchema>;
export type Friend = typeof friends.$inferSelect;

// Messages - encrypted with TTL
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  senderPublicKey: text("sender_public_key").notNull().references(() => users.publicKey, { onDelete: "cascade" }),
  receiverPublicKey: text("receiver_public_key").notNull().references(() => users.publicKey, { onDelete: "cascade" }),
  encryptedPayloads: text("encrypted_payloads").notNull(), // JSON string: [{ devicePublicKey, ciphertext, nonce, ephemeralPublicKey, salt }]
  ttlSeconds: integer("ttl_seconds").notNull(),
  conversationId: text("conversation_id").notNull(),
  isRead: boolean("is_read").default(false),
  reactions: text("reactions"), // JSON string: { "user_key": "emoji", ... }
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => ({
  senderPublicKeyIdx: index("messages_sender_public_key_idx").on(table.senderPublicKey),
  receiverPublicKeyIdx: index("messages_receiver_public_key_idx").on(table.receiverPublicKey),
  expiresAtIdx: index("messages_expires_at_idx").on(table.expiresAt),
  conversationIdx: index("messages_conversation_idx").on(table.senderPublicKey, table.receiverPublicKey),
  conversationIdIdx: index("messages_conversation_id_idx").on(table.conversationId, table.createdAt, table.id),
}));

export const insertMessageSchema = createInsertSchema(messages).pick({
  senderPublicKey: true,
  receiverPublicKey: true,
  encryptedPayloads: true,
  ttlSeconds: true,
  expiresAt: true,
}).extend({
  conversationId: z.string().optional(),
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Blocklist
export const blocklist = pgTable("blocklist", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  blockerPublicKey: text("blocker_public_key").notNull().references(() => users.publicKey, { onDelete: "cascade" }),
  blockedPublicKey: text("blocked_public_key").notNull().references(() => users.publicKey, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  blockerPublicKeyIdx: index("blocklist_blocker_public_key_idx").on(table.blockerPublicKey),
  blockedPublicKeyIdx: index("blocklist_blocked_public_key_idx").on(table.blockedPublicKey),
  blockPairIdx: uniqueIndex("blocklist_block_pair_idx").on(table.blockerPublicKey, table.blockedPublicKey),
}));

export const insertBlockSchema = createInsertSchema(blocklist).pick({
  blockerPublicKey: true,
  blockedPublicKey: true,
});

export type InsertBlock = z.infer<typeof insertBlockSchema>;
export type Block = typeof blocklist.$inferSelect;

// Devices table
export const devices = pgTable("devices", {
  deviceId: uuid("device_id").primaryKey().default(sql`gen_random_uuid()`),
  userPublicKey: text("user_public_key").notNull().references(() => users.publicKey, { onDelete: "cascade" }),
  devicePublicKey: text("device_public_key").notNull().unique(),
  deviceName: text("device_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  revoked: boolean("revoked").default(false),
  identitySignature: text("identity_signature"),
}, (table) => ({
  userPublicKeyIdx: index("idx_devices_user_public_key").on(table.userPublicKey),
}));

export const insertDeviceSchema = createInsertSchema(devices).pick({
  userPublicKey: true,
  devicePublicKey: true,
  deviceName: true,
  identitySignature: true,
});

export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devices.$inferSelect;

// Identity Key History table
export const identityKeyHistory = pgTable("identity_key_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userPublicKey: text("user_public_key").notNull(),
  oldPublicKey: text("old_public_key").notNull(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }).defaultNow(),
});

export const insertIdentityKeyHistorySchema = createInsertSchema(identityKeyHistory).pick({
  userPublicKey: true,
  oldPublicKey: true,
});

export type InsertIdentityKeyHistory = z.infer<typeof insertIdentityKeyHistorySchema>;
export type IdentityKeyHistory = typeof identityKeyHistory.$inferSelect;

// Prekey bundles — persistent, DB-backed X3DH prekey store (replaces volatile Map)
export const prekeyBundles = pgTable("prekey_bundles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  identityPublicKey: text("identity_public_key").notNull().unique()
    .references(() => users.publicKey, { onDelete: "cascade" }),
  signedPreKey: text("signed_pre_key").notNull(),
  preKeySignature: text("pre_key_signature").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => ({
  identityKeyIdx: index("prekey_bundles_identity_key_idx").on(table.identityPublicKey),
  expiresAtIdx: index("prekey_bundles_expires_at_idx").on(table.expiresAt),
}));

export const insertPrekeyBundleSchema = createInsertSchema(prekeyBundles).pick({
  identityPublicKey: true,
  signedPreKey: true,
  preKeySignature: true,
  expiresAt: true,
});

export type InsertPrekeyBundle = z.infer<typeof insertPrekeyBundleSchema>;
export type PrekeyBundle = typeof prekeyBundles.$inferSelect;

// Device challenges — for challenge-response device registration
export const deviceChallenges = pgTable("device_challenges", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userPublicKey: text("user_public_key").notNull()
    .references(() => users.publicKey, { onDelete: "cascade" }),
  challenge: text("challenge").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  challengeIdx: uniqueIndex("device_challenges_challenge_idx").on(table.challenge),
  userPublicKeyIdx: index("device_challenges_user_idx").on(table.userPublicKey),
  expiresAtIdx: index("device_challenges_expires_at_idx").on(table.expiresAt),
}));

export type DeviceChallenge = typeof deviceChallenges.$inferSelect;

// One-Time Prekeys — consumed once per X3DH session initiation
export const oneTimePrekeys = pgTable("one_time_prekeys", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  identityPublicKey: text("identity_public_key").notNull()
    .references(() => users.publicKey, { onDelete: "cascade" }),
  oneTimePreKey: text("one_time_pre_key").notNull().unique(),
  used: boolean("used").default(false).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => ({
  identityKeyIdx: index("opk_identity_key_idx").on(table.identityPublicKey),
  usedIdx: index("opk_used_idx").on(table.used),
  expiresAtIdx: index("opk_expires_at_idx").on(table.expiresAt),
}));

export const insertOneTimePrekeySchema = createInsertSchema(oneTimePrekeys).pick({
  identityPublicKey: true,
  oneTimePreKey: true,
  expiresAt: true,
});

export type InsertOneTimePrekey = z.infer<typeof insertOneTimePrekeySchema>;
export type OneTimePrekey = typeof oneTimePrekeys.$inferSelect;

// Auth Nonces — server-side replay protection for signed requests (5-min TTL)
export const authNonces = pgTable("auth_nonces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  nonce: text("nonce").notNull().unique(),
  publicKey: text("public_key").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  nonceIdx: uniqueIndex("auth_nonces_nonce_idx").on(table.nonce),
  expiresAtIdx: index("auth_nonces_expires_at_idx").on(table.expiresAt),
}));

export type AuthNonce = typeof authNonces.$inferSelect;

// Device Linking Requests - for cross-device identity transfer
export const linkingRequests = pgTable("linking_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userPublicKey: text("user_public_key").notNull().references(() => users.publicKey, { onDelete: "cascade" }),
  devicePublicKey: text("device_public_key").notNull().unique(),
  deviceName: text("device_name"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default('pending'), // 'pending', 'approved', 'rejected'
  identitySignature: text("identity_signature"), // Provided by the approving device
  encryptedIdentity: text("encrypted_identity"), // Encrypted with devicePublicKey (X25519)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdx: index("linking_requests_user_idx").on(table.userPublicKey),
  deviceIdx: uniqueIndex("linking_requests_device_idx").on(table.devicePublicKey),
}));

export const insertLinkingRequestSchema = createInsertSchema(linkingRequests).pick({
  userPublicKey: true,
  devicePublicKey: true,
  deviceName: true,
  expiresAt: true,
});

export type InsertLinkingRequest = z.infer<typeof insertLinkingRequestSchema>;
export type LinkingRequest = typeof linkingRequests.$inferSelect;

// TTL options for messages (in seconds)
export const TTL_OPTIONS = [
  { label: "30 seconds", value: 30 },
  { label: "5 minutes", value: 300 },
  { label: "1 hour", value: 3600 },
  { label: "6 hours", value: 21600 },
  { label: "12 hours", value: 43200 },
  { label: "24 hours", value: 86400 },
] as const;
// ... (rest of file)

export const DEFAULT_TTL = 86400; // 24 hours

// Frontend-only types for local storage
export interface LocalIdentity {
  publicKey: string;
  privateKey: string;
  recoveryPhrase?: string; // Only used transiently during onboarding; never persisted
}

export interface LocalFriend {
  publicKey: string;
  displayName: string;
  verified?: boolean; // Safety number verified status
  verifiedFingerprint?: string; // SHA-256(identityPub) at time of verification — TOFU anchor
  lastMessageAt?: string;
  lastMessagePreview?: string;
}

export interface DecryptedMessage {
  id: string;
  senderPublicKey: string;
  receiverPublicKey: string;
  plaintext: string;
  ttlSeconds: number;
  isRead: boolean;
  reactions: Record<string, string>;
  createdAt: Date;
  expiresAt: Date;
  isMine: boolean;
}

// Typing indicator state (in-memory only)
export interface TypingState {
  [publicKey: string]: { typingWith: string; expiresAt: number };
}
