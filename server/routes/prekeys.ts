/**
 * Prekey routes — upload and retrieve E2E prekey bundles (used in X3DH session bootstrap).
 */
import type { Express } from 'express';
import { requireAuth } from '../middleware/auth';
import { storage } from '../storage';
import { validatePublicKey } from '../utils/validate';
import { logSecurityEvent } from '../logger/security';
import { logError } from '../utils/log';
import { strictLimiter } from '../utils/rateLimiters';

const PREKEY_TTL_DAYS = 30;

export function registerPrekeyRoutes(app: Express): void {
  // ── Prekeys (X3DH) ────────────────────────────────────────────────────────────

  // Upload a signed prekey bundle (called by client after key generation)
  app.post("/api/prekeys", requireAuth, strictLimiter, async (req, res) => {
    try {
      const userPublicKey = req.authPublicKey!;
      const { identityPublicKey, signedPreKey, preKeySignature } = req.body;

      if (!identityPublicKey || typeof identityPublicKey !== 'string' || !validatePublicKey(identityPublicKey)) {
        return res.status(400).json({ error: "Invalid identity public key" });
      }
      if (!signedPreKey || typeof signedPreKey !== 'string' || !validatePublicKey(signedPreKey)) {
        return res.status(400).json({ error: "Invalid signed pre-key" });
      }
      if (!preKeySignature || typeof preKeySignature !== 'string' ||
          !/^[0-9a-f]{128}$/i.test(preKeySignature)) {
        return res.status(400).json({ error: "Invalid pre-key signature (expected 64-byte hex)" });
      }
      
      if (identityPublicKey.toLowerCase().trim() !== userPublicKey.toLowerCase().trim()) {
        return res.status(403).json({ error: "Prekey identity mismatch" });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + PREKEY_TTL_DAYS);

      await storage.upsertPrekeyBundle({
        identityPublicKey: userPublicKey,
        signedPreKey,
        preKeySignature,
        expiresAt,
      });

      logSecurityEvent({
        type: 'key_rotation',
        publicKey: userPublicKey,
        ip: req.ip || 'unknown',
        details: { action: 'upload_prekey_bundle' },
      });

      res.json({ success: true });
    } catch (error) {
      logError('uploadPrekeyBundle', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Fetch a user's prekey bundle
  app.get("/api/prekeys/:publicKey", requireAuth, async (req, res) => {
    try {
      const targetKey = (req.params.publicKey || '').toLowerCase().trim();

      if (!validatePublicKey(targetKey)) {
        return res.status(400).json({ error: "Invalid public key format" });
      }

      const bundle = await storage.getPrekeyBundle(targetKey);
      if (!bundle) {
        return res.status(404).json({ error: "Prekey bundle not found or expired" });
      }

      res.json({
        identityPublicKey: bundle.identityPublicKey,
        signedPreKey: bundle.signedPreKey,
        preKeySignature: bundle.preKeySignature,
      });
    } catch (error) {
      logError('fetchPrekeyBundle', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
