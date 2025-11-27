import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertUserSchema,
  insertFriendCodeSchema,
  insertFriendSchema,
  insertMessageSchema,
  insertBlockSchema,
} from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ==================== USERS ====================
  
  // Register a new user (just their public key)
  app.post("/api/users", async (req, res) => {
    try {
      const { publicKey, devicePublicKey } = req.body;
      
      if (!publicKey) {
        return res.status(400).json({ error: "Public key is required" });
      }
      
      const user = await storage.createUser({ publicKey, devicePublicKey });
      
      // Return generic response to prevent enumeration
      res.json({ success: true });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // ==================== FRIEND CODES ====================
  
  // Create a new friend code
  app.post("/api/friend-codes", async (req, res) => {
    try {
      const { code, identityPublicKey, expiresAt } = req.body;
      
      if (!code || !identityPublicKey || !expiresAt) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const friendCode = await storage.createFriendCode({
        code,
        identityPublicKey,
        expiresAt: new Date(expiresAt),
      });
      
      res.json({ success: true, code: friendCode.code });
    } catch (error) {
      console.error("Error creating friend code:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Redeem a friend code
  app.post("/api/friend-codes/redeem", async (req, res) => {
    try {
      const { code, redeemerPublicKey, friendName } = req.body;
      
      if (!code || !redeemerPublicKey) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const friendCode = await storage.getFriendCodeByCode(code);
      
      if (!friendCode) {
        return res.status(404).json({ error: "Invalid or expired code" });
      }
      
      // Cannot redeem your own code
      if (friendCode.identityPublicKey === redeemerPublicKey) {
        return res.status(400).json({ error: "Cannot add yourself as a friend" });
      }
      
      // Check if already friends
      const alreadyFriends = await storage.areFriends(
        friendCode.identityPublicKey,
        redeemerPublicKey
      );
      
      if (alreadyFriends) {
        return res.status(400).json({ error: "Already friends" });
      }
      
      // Mark code as used
      await storage.markFriendCodeUsed(code);
      
      // Create mutual friendship
      await storage.createFriend({
        userPublicKey: redeemerPublicKey,
        friendPublicKey: friendCode.identityPublicKey,
        friendName: friendName || null,
      });
      
      await storage.createFriend({
        userPublicKey: friendCode.identityPublicKey,
        friendPublicKey: redeemerPublicKey,
        friendName: null, // The code creator can set their own name later
      });
      
      res.json({ 
        success: true, 
        friendPublicKey: friendCode.identityPublicKey 
      });
    } catch (error) {
      console.error("Error redeeming friend code:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // ==================== FRIENDS ====================
  
  // Get friends list
  app.get("/api/friends/:publicKey", async (req, res) => {
    try {
      const { publicKey } = req.params;
      const friends = await storage.getFriends(publicKey);
      res.json(friends);
    } catch (error) {
      console.error("Error getting friends:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // ==================== MESSAGES ====================
  
  // Send a message
  app.post("/api/messages", async (req, res) => {
    try {
      const {
        senderPublicKey,
        receiverPublicKey,
        ciphertext,
        nonce,
        ephemeralPublicKey,
        ttlSeconds,
        expiresAt,
      } = req.body;
      
      if (!senderPublicKey || !receiverPublicKey || !ciphertext || !nonce || !ephemeralPublicKey || !ttlSeconds || !expiresAt) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Check if sender is blocked by receiver
      const isBlocked = await storage.isBlocked(receiverPublicKey, senderPublicKey);
      if (isBlocked) {
        // Silently succeed to prevent enumeration
        return res.json({ success: true });
      }
      
      const message = await storage.createMessage({
        senderPublicKey,
        receiverPublicKey,
        ciphertext,
        nonce,
        ephemeralPublicKey,
        ttlSeconds,
        expiresAt: new Date(expiresAt),
      });
      
      res.json({ success: true, messageId: message.id });
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Get messages for a conversation
  app.get("/api/messages/:userPublicKey", async (req, res) => {
    try {
      const { userPublicKey } = req.params;
      const { friendPublicKey } = req.query;
      
      if (!friendPublicKey || typeof friendPublicKey !== 'string') {
        return res.status(400).json({ error: "Friend public key is required" });
      }
      
      // Get blocked users to filter messages
      const blockedUsers = await storage.getBlockedUsers(userPublicKey);
      
      const messages = await storage.getMessages(userPublicKey, friendPublicKey);
      
      // Filter out messages from blocked users
      const filteredMessages = messages.filter(
        (msg) => !blockedUsers.includes(msg.senderPublicKey)
      );
      
      res.json(filteredMessages);
    } catch (error) {
      console.error("Error getting messages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // ==================== BLOCKLIST ====================
  
  // Block a user
  app.post("/api/block", async (req, res) => {
    try {
      const { blockerPublicKey, blockedPublicKey } = req.body;
      
      if (!blockerPublicKey || !blockedPublicKey) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      await storage.blockUser({ blockerPublicKey, blockedPublicKey });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error blocking user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Unblock a user
  app.post("/api/unblock", async (req, res) => {
    try {
      const { blockerPublicKey, blockedPublicKey } = req.body;
      
      if (!blockerPublicKey || !blockedPublicKey) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      await storage.unblockUser(blockerPublicKey, blockedPublicKey);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error unblocking user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Get blocked users
  app.get("/api/blocked/:publicKey", async (req, res) => {
    try {
      const { publicKey } = req.params;
      const blockedUsers = await storage.getBlockedUsers(publicKey);
      res.json(blockedUsers);
    } catch (error) {
      console.error("Error getting blocked users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
