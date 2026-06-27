/**
 * User routes — registration, key history, and identity key rotation.
 */
import type { Express } from 'express';
import { requireAuth } from '../middleware/auth';
import { storage } from '../storage';
import { validatePublicKey } from '../utils/validate';
import { logSecurityEvent } from '../logger/security';
import { logError } from '../utils/log';
import { strictLimiter, globalRegistrationLimiter } from '../utils/rateLimiters';

export function registerUserRoutes(app: Express): void {
  // ── Users ─────────────────────────────────────────────────────────────────────

  // Register a new user (just their public key)
  app.post("/api/users", strictLimiter, globalRegistrationLimiter, async (req, res) => {
    try {
      const { publicKey, displayName } = req.body;

      if (!publicKey || !validatePublicKey(publicKey)) {
        return res.status(400).json({ error: "Invalid public key" });
      }

      const sanitizedName = typeof displayName === 'string' ? displayName.trim().slice(0, 30) : undefined;
      await storage.createUser({ publicKey, displayName: sanitizedName || undefined });

      res.json({ success: true });
    } catch (error) {
      logError('createUser', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get current user's key history
  app.get("/api/users/key-history", requireAuth, async (req, res) => {
    try {
      const history = await storage.getIdentityKeyHistory(req.authPublicKey!);
      res.json(history);
    } catch (error) {
      logError('getKeyHistory', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Rotate identity key
  app.post("/api/users/rotate-key", requireAuth, strictLimiter, async (req, res) => {
    try {
      const { newPublicKey } = req.body;
      const oldPublicKey = req.authPublicKey!;

      if (!newPublicKey || !validatePublicKey(newPublicKey)) {
        return res.status(400).json({ error: "Invalid new public key" });
      }

      await storage.rotateIdentityKey(oldPublicKey, newPublicKey);
      
      logSecurityEvent({
        type: 'key_rotation',
        publicKey: newPublicKey,
        ip: req.ip || 'unknown',
        details: { action: 'identity_key_rotation', oldPublicKey },
      });

      res.json({ success: true });
    } catch (error: any) {
      if (
        error?.code === '23505' ||
        error?.message?.includes('duplicate') ||
        error?.message?.includes('unique')
      ) {
        return res.status(409).json({ error: 'Public key already registered to another account' });
      }
      logError('rotateKey', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
