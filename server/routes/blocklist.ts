/**
 * Blocklist routes — block and unblock users, and list currently blocked users.
 */
import type { Express } from 'express';
import { requireAuth } from '../middleware/auth';
import { storage } from '../storage';
import { validatePublicKey } from '../utils/validate';
import { logError } from '../utils/log';
import { strictLimiter } from '../utils/rateLimiters';

export function registerBlocklistRoutes(app: Express): void {
  // ── Blocklist ──────────────────────────────────────────────────────────────────

  // Block a user
  app.post("/api/block", requireAuth, strictLimiter, async (req, res) => {
    try {
      const rawBlockedKey = req.body.blockedPublicKey;
      const blockerPublicKey = req.authPublicKey!;

      if (!rawBlockedKey || !validatePublicKey(rawBlockedKey)) {
        return res.status(400).json({ error: "Invalid blocked public key" });
      }

      const blockedPublicKey = rawBlockedKey.toLowerCase().trim();

      if (blockerPublicKey === blockedPublicKey) {
        return res.status(400).json({ error: "Cannot block yourself" });
      }

      await storage.blockUser({ blockerPublicKey, blockedPublicKey });

      res.json({ success: true });
    } catch (error) {
      logError('blockUser', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Unblock a user
  app.post("/api/unblock", requireAuth, strictLimiter, async (req, res) => {
    try {
      const rawBlockedKey = req.body.blockedPublicKey;
      const blockerPublicKey = req.authPublicKey!;

      if (!rawBlockedKey || !validatePublicKey(rawBlockedKey)) {
        return res.status(400).json({ error: "Invalid blocked public key" });
      }

      const blockedPublicKey = rawBlockedKey.toLowerCase().trim();

      await storage.unblockUser(blockerPublicKey, blockedPublicKey);

      res.json({ success: true });
    } catch (error) {
      logError('unblockUser', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get blocked users
  app.get("/api/blocked/:publicKey", requireAuth, async (req, res) => {
    try {
      const { publicKey } = req.params;

      if (req.authPublicKey !== publicKey) {
        return res.status(401).json({ error: "Public key mismatch" });
      }

      if (!validatePublicKey(publicKey)) {
        return res.status(400).json({ error: "Invalid public key" });
      }

      const blockedUsers = await storage.getBlockedUsers(publicKey);
      res.json(blockedUsers);
    } catch (error) {
      logError('getBlockedUsers', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
