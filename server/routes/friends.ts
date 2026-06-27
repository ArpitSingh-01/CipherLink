/**
 * Friend routes — generate friend codes, redeem codes, handle requests, and list friends.
 */
import type { Express } from 'express';
import { requireAuth } from '../middleware/auth';
import { storage } from '../storage';
import { validatePublicKey, validateFriendCode } from '../utils/validate';
import { notifyFriendEvent } from '../broadcast';
import { logError } from '../utils/log';
import { strictLimiter } from '../utils/rateLimiters';

export function registerFriendRoutes(app: Express): void {
  // ── Friend Codes ──────────────────────────────────────────────────────────────

  // Create a new friend code
  app.post("/api/friend-codes", requireAuth, strictLimiter, async (req, res) => {
    try {
      let { code, expiresAt } = req.body;
      const identityPublicKey = req.authPublicKey!;

      if (!code) {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        code = "";
        const randomBytes = new Uint8Array(8);
        crypto.getRandomValues(randomBytes);
        for (let i = 0; i < 8; i++) {
          code += chars.charAt(randomBytes[i] % chars.length);
        }
      }

      if (!expiresAt) {
        expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
      }

      if (!validateFriendCode(code)) {
        return res.status(400).json({ error: "Invalid friend code format" });
      }

      if (!expiresAt) {
        return res.status(400).json({ error: "Missing expiration date" });
      }

      const friendCode = await storage.createFriendCode({
        code,
        identityPublicKey,
        expiresAt: new Date(expiresAt),
      });

      res.json({ success: true, code: friendCode.code });
    } catch (error) {
      logError('createFriendCode', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Redeem a friend code
  app.post("/api/friend-codes/redeem", requireAuth, strictLimiter, async (req, res) => {
    try {
      const { code } = req.body;
      const redeemerPublicKey = req.authPublicKey!;

      if (!code || !validateFriendCode(code)) {
        return res.status(400).json({ error: "Invalid friend code format" });
      }

      try {
        const result = await storage.redeemFriendCode(code, redeemerPublicKey);
        res.json({
          success: true,
          friendPublicKey: result.friendPublicKey
        });

        notifyFriendEvent(result.friendPublicKey, 'friend_request');
      } catch (err) {
        const error = err as any;
        const msg = error?.message || '';
        if (msg.includes('Invalid') || msg.includes('expired')) {
          return res.status(400).json({ error: "Invalid code" });
        }
        if (msg.includes('yourself')) {
          return res.status(400).json({ error: "Cannot add yourself as a friend" });
        }
        if (msg.includes('Already')) {
          return res.status(400).json({ error: "Already friends or request pending" });
        }
        throw err;
      }
    } catch (error) {
      logError('redeemFriendCode', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Friend Requests ───────────────────────────────────────────────────────────

  // Get pending friend requests
  app.get("/api/friend-requests/:publicKey", requireAuth, async (req, res) => {
    try {
      const { publicKey } = req.params;

      if (req.authPublicKey !== publicKey) {
        return res.status(401).json({ error: "Public key mismatch" });
      }

      if (!validatePublicKey(publicKey)) {
        return res.status(400).json({ error: "Invalid public key" });
      }

      const pendingRequests = await storage.getPendingFriendRequests(publicKey);
      res.json(pendingRequests);
    } catch (error) {
      logError('getFriendRequests', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Accept a friend request
  app.post("/api/friend-requests/accept", requireAuth, strictLimiter, async (req, res) => {
    try {
      const rawFriendKey = req.body.friendPublicKey;
      const userPublicKey = req.authPublicKey!;

      if (!rawFriendKey || !validatePublicKey(rawFriendKey)) {
        return res.status(400).json({ error: "Invalid friend public key" });
      }

      const friendPublicKey = rawFriendKey.toLowerCase().trim();

      const affected = await storage.acceptFriendRequest(userPublicKey, friendPublicKey);
      if (!affected) {
        return res.status(404).json({ error: 'Friend request not found or already handled' });
      }

      res.json({ success: true, friendPublicKey });

      notifyFriendEvent(friendPublicKey, 'friend_accepted');
      notifyFriendEvent(userPublicKey, 'friend_accepted');
    } catch (error) {
      logError('acceptFriendRequest', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Decline a friend request
  app.post("/api/friend-requests/decline", requireAuth, strictLimiter, async (req, res) => {
    try {
      const rawFriendKey = req.body.friendPublicKey;
      const userPublicKey = req.authPublicKey!;

      if (!rawFriendKey || !validatePublicKey(rawFriendKey)) {
        return res.status(400).json({ error: "Invalid friend public key" });
      }

      const friendPublicKey = rawFriendKey.toLowerCase().trim();

      const affected = await storage.declineFriendRequest(userPublicKey, friendPublicKey);
      if (!affected) {
        return res.status(404).json({ error: 'Friend request not found or already handled' });
      }

      res.json({ success: true });
    } catch (error) {
      logError('declineFriendRequest', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Friends List ──────────────────────────────────────────────────────────────

  // Get friends list
  app.get("/api/friends/:publicKey", requireAuth, async (req, res) => {
    try {
      const { publicKey } = req.params;

      if (req.authPublicKey !== publicKey) {
        return res.status(401).json({ error: "Public key mismatch" });
      }

      if (!validatePublicKey(publicKey)) {
        return res.status(400).json({ error: "Invalid public key" });
      }

      const friends = await storage.getFriends(publicKey);

      const friendKeys = friends.map(f => f.friendPublicKey);
      const displayNames = await storage.getUsersDisplayNames(friendKeys);

      const enrichedFriends = friends.map(friend => ({
        ...friend,
        friendDisplayName: displayNames.get(friend.friendPublicKey.toLowerCase().trim()) ?? null,
      }));

      res.json(enrichedFriends);
    } catch (error) {
      logError('getFriends', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
