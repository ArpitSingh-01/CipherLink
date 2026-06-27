/**
 * Message routes — send and retrieve E2E encrypted messages, and send typing indicators.
 * All content is opaque ciphertext; the server never reads message body.
 * Rate limited: 30 messages/minute in production.
 */
import type { Express } from 'express';
import { requireAuth } from '../middleware/auth';
import { storage } from '../storage';
import {
  validatePublicKey,
  validateCiphertext,
  nonceSchema,
  ephemeralKeySchema,
  saltSchema
} from '../utils/validate';
import { notifyNewMessage, notifyFriendEvent } from '../broadcast';
import { logSecurityEvent } from '../logger/security';
import { logError } from '../utils/log';
import { messageLimiter } from '../utils/rateLimiters';

export function registerMessageRoutes(app: Express): void {
  // ── Typing Indicators ─────────────────────────────────────────────────────────

  app.post('/api/typing', requireAuth, async (req, res) => {
    try {
      const { receiverPublicKey } = req.body;
      const senderPublicKey = req.authPublicKey!;

      if (!receiverPublicKey || !validatePublicKey(receiverPublicKey)) {
        return res.status(400).json({ error: 'Invalid receiver public key' });
      }

      const canNotify = await storage.areMutualFriends(senderPublicKey, receiverPublicKey);
      if (!canNotify) return res.json({ success: true });

      notifyFriendEvent(receiverPublicKey, 'typing');

      res.json({ success: true });
    } catch (error) {
      logError('sendTypingIndicator', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Messages ──────────────────────────────────────────────────────────────────

  // Send a message
  app.post("/api/messages", requireAuth, messageLimiter, async (req, res) => {
    const { encryptedPayloads, ttlSeconds } = req.body;
    const senderPublicKey = req.authPublicKey!;

    try {
      const rawReceiverKey = req.body.receiverPublicKey;
      if (!rawReceiverKey || !validatePublicKey(rawReceiverKey)) {
        return res.status(400).json({ error: "Invalid receiver public key" });
      }
      const receiverPublicKey = rawReceiverKey.toLowerCase().trim();

      if (senderPublicKey === receiverPublicKey) {
        return res.status(400).json({ error: "Cannot send messages to yourself" });
      }

      if (!encryptedPayloads || !Array.isArray(encryptedPayloads) || encryptedPayloads.length === 0) {
        return res.status(400).json({ error: "Missing or invalid encrypted payloads" });
      }

      const MAX_PAYLOADS_PER_MESSAGE = 20;
      if (encryptedPayloads.length > MAX_PAYLOADS_PER_MESSAGE) {
        return res.status(400).json({ error: `Too many encrypted payloads (max ${MAX_PAYLOADS_PER_MESSAGE})` });
      }

      for (const payload of encryptedPayloads) {
        if (!payload.devicePublicKey || !validatePublicKey(payload.devicePublicKey)) {
          return res.status(400).json({ error: "Invalid device key in payload" });
        }
        if (!payload.ciphertext || !validateCiphertext(payload.ciphertext)) {
          return res.status(400).json({ error: "Invalid ciphertext in payload" });
        }
        if (!payload.nonce || !nonceSchema.safeParse(payload.nonce).success) {
          return res.status(400).json({ error: "Invalid nonce in payload" });
        }
        if (!payload.ephemeralPublicKey || !ephemeralKeySchema.safeParse(payload.ephemeralPublicKey).success) {
          return res.status(400).json({ error: "Invalid ephemeral key in payload" });
        }
        if (!payload.salt || !saltSchema.safeParse(payload.salt).success) {
          return res.status(400).json({ error: 'Invalid or missing salt in payload' });
        }
      }

      const ALLOWED_TTL = [30, 300, 3600, 21600, 43200, 86400];
      if (!ttlSeconds || typeof ttlSeconds !== 'number' || !ALLOWED_TTL.includes(Number(ttlSeconds))) {
        return res.status(400).json({ error: "Invalid TTL value" });
      }

      const expiresAt = new Date(Date.now() + Number(ttlSeconds) * 1000);
      
      const isBlocked = await storage.isBlocked(receiverPublicKey, senderPublicKey);
      if (isBlocked) {
        return res.json({ success: true });
      }

      const friendshipExists = await storage.areMutualFriends(senderPublicKey, receiverPublicKey);
      if (!friendshipExists) {
        return res.json({ success: true });
      }

      const receiverDevices = await storage.getDevices(receiverPublicKey);
      const activeDeviceKeys = new Set(
        receiverDevices.filter(d => !d.revoked).map(d => d.devicePublicKey.toLowerCase())
      );

      for (const payload of encryptedPayloads) {
        const targetKey = payload.devicePublicKey.toLowerCase();
        if (!activeDeviceKeys.has(targetKey)) {
          return res.status(400).json({ error: `Unknown device target: ${targetKey.slice(0, 8)}...` });
        }
      }

      const message = await storage.createMessage({
        senderPublicKey,
        receiverPublicKey,
        encryptedPayloads: JSON.stringify(encryptedPayloads),
        ttlSeconds,
        expiresAt,
      });

      res.json({ success: true, messageId: message.id });

      notifyNewMessage(receiverPublicKey, senderPublicKey);
    } catch (error) {
      const err = error as any;
      if (err?.code === 'DUPLICATE_MESSAGE') {
        logSecurityEvent({
          type: 'replay_attempt',
          publicKey: req.authPublicKey!,
          ip: req.ip || 'unknown',
          details: { senderPublicKey, receiverPublicKey: req.body.receiverPublicKey },
        });
        return res.status(409).json({ error: "Duplicate message rejected" });
      }

      logError('sendMessage', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get messages for a conversation
  app.get("/api/messages/:userPublicKey", requireAuth, messageLimiter, async (req, res) => {
    try {
      const { userPublicKey } = req.params;

      if (req.authPublicKey !== userPublicKey) {
        return res.status(401).json({ error: "Public key mismatch" });
      }
      const { friendPublicKey } = req.query;

      if (!validatePublicKey(userPublicKey)) {
        return res.status(400).json({ error: "Invalid user public key" });
      }

      if (!friendPublicKey || typeof friendPublicKey !== 'string' || !validatePublicKey(friendPublicKey)) {
        return res.status(400).json({ error: "Invalid friend public key" });
      }

      const blockedUsers = await storage.getBlockedUsers(userPublicKey);

      const messages = await storage.getMessages(userPublicKey, friendPublicKey);

      const filteredMessages = messages.filter(
        (msg) => !blockedUsers.includes(msg.senderPublicKey)
      );

      res.json(filteredMessages);
    } catch (error) {
      logError('getMessages', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
