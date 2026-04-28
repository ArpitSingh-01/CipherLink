import type { Express } from "express";
import type { Server } from "http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { z } from "zod";
import { requireAuth, requireAuthBootstrap } from "./middleware/auth";
import { logSecurityEvent } from "./logger/security";
import { cleanupExpiredData } from "./cleanup";
import { notifyNewMessage, notifyFriendEvent } from "./ws";
import { db } from "./db";
import { messages, authNonces } from "@shared/schema";
import { lt } from "drizzle-orm";

const isDev = process.env.NODE_ENV !== 'production';

/** Guarded dev-only error logger — never throws, never leaks in production. */
function devLog(label: string, error: unknown): void {
  if (isDev) {
    try { console.error(label, error); } catch { /* ignore logging errors */ }
  }
}

// Strict rate limiter for sensitive endpoints
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 100,
  message: 'Too many attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// P1-03: Strong global rate limit for registration to prevent abuse
const globalRegistrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // global max 100 accounts per hour
  keyGenerator: () => 'global_registration', // Fixed key groups all IPs together
  message: 'Global registration rate limit exceeded. Please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Specific limiter for message sending to prevent spam
const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 30 : 100, // 30 messages per minute in prod
  message: 'Message rate limit exceeded. Please wait a moment.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation schemas
const publicKeySchema = z.string().regex(/^[0-9a-f]{64}$/i, "Invalid public key format");
const friendCodeSchema = z.string().regex(/^[A-Z2-9]{8}$/, "Invalid friend code format (exactly 8 chars)");
// friendName removed — personal relationship metadata must only be stored locally (FIX 5)
const ciphertextSchema = z.string().max(100000, "Message too large"); // 100KB limit
const nonceSchema = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid nonce format"); // 12 bytes = 24 hex
const saltSchema = z.string().regex(/^[0-9a-f]{64}$/i, "Invalid salt format"); // 32 bytes = 64 hex
const ephemeralKeySchema = z.string().regex(/^[0-9a-f]{64}$/i, "Invalid ephemeral public key format"); // 32 bytes = 64 hex

// Validation middleware
function validatePublicKey(key: string): boolean {
  return publicKeySchema.safeParse(key).success;
}

function validateFriendCode(code: string): boolean {
  return friendCodeSchema.safeParse(code).success;
}

// validateFriendName removed — friendName no longer stored server-side (FIX 5)

function validateCiphertext(text: string): boolean {
  return ciphertextSchema.safeParse(text).success;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ==================== VERCEL CRON CLEANUP (FIX 3) ====================

  // Triggered every 5 minutes by vercel.json crons config
  // Protected by Vercel's CRON_SECRET in production
  app.get('/api/internal/cleanup', async (req, res) => {
    // Verify this is called by Vercel Cron, not a random user
    const authHeader = req.headers['authorization'];
    if (process.env.NODE_ENV === 'production') {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    try {
      const result = await cleanupExpiredData();

      // Belt-and-suspenders: hard 24-hour cap regardless of TTL
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await db.delete(messages).where(lt(messages.createdAt, twentyFourHoursAgo)).catch(() => {});
      await db.delete(authNonces).where(lt(authNonces.expiresAt, new Date())).catch(() => {});

      res.json({
        success: true,
        deletedMessages: result.deletedMessages,
        deletedCodes: result.deletedCodes,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      devLog('Cleanup cron failed:', error);
      res.status(500).json({ error: 'Cleanup failed' });
    }
  });

  // ==================== HEALTH CHECK ====================

  app.get('/health', (_req, res) => {
    // SEC-FIX: Minimal health check — do not expose internal metrics (uptime, DB details) in prod
    res.json({ status: 'ok' });
  });

  // ==================== USERS ====================

  // Register a new user (just their public key)
    app.post("/api/users", strictLimiter, globalRegistrationLimiter, async (req, res) => {
    try {
      const { publicKey, devicePublicKey, identitySignature, displayName } = req.body;

      if (!publicKey || !validatePublicKey(publicKey)) {
        return res.status(400).json({ error: "Invalid public key" });
      }

      if (devicePublicKey && !validatePublicKey(devicePublicKey)) {
        return res.status(400).json({ error: "Invalid device public key" });
      }

      // MED-A: devicePublicKey/identitySignature removed from user-creation path (CRIT-B fix).
      // CRIT-B FIX: POST /api/users must ONLY register the X25519 public key.
      // First-device registration (including any identity_signature) MUST flow through
      // the challenge-response endpoint (POST /api/devices/register-challenged) so the
      // bootstrap is bound to a server-issued nonce, not a tautological self-signature.
      // Silently ignore any devicePublicKey/identitySignature fields sent here.

      // CRIT-B FIX: Only create user record — no device registered here.
      // Device registration is a separate, challenge-bound operation.
      // Accept displayName — it's the user's self-chosen public name (safe to store)
      const sanitizedName = typeof displayName === 'string' ? displayName.trim().slice(0, 30) : undefined;
      await storage.createUser({ publicKey, displayName: sanitizedName || undefined });

      // Return generic response to prevent enumeration
      res.json({ success: true });
    } catch (error) {
      devLog('Error creating user:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get current user's key history
  app.get("/api/users/key-history", requireAuth, async (req, res) => {
    try {
      const history = await storage.getIdentityKeyHistory(req.authPublicKey!);
      res.json(history);
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== DEVICES ====================

  // Get user's active devices — ALWAYS for the authenticated user only
  app.get("/api/devices", requireAuth, async (req, res) => {
    try {
      // HIGH-2 FIX: Never accept userPublicKey from query params.
      // An attacker could enumerate any user's device list by passing an
      // arbitrary key. The identity is authoritative from req.authPublicKey.
      const userPublicKey = req.authPublicKey!;

      const devices = await storage.getDevices(userPublicKey);
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Devices] Found ${devices.length} devices for user ${userPublicKey.substring(0, 8)}...`);
      }

      // Only return non-revoked devices and ensure property names match frontend expectations
      const activeDevices = devices
        .filter(d => !d.revoked)
        .map(d => ({
          deviceId: d.deviceId,
          userPublicKey: d.userPublicKey,
          devicePublicKey: d.devicePublicKey,
          identitySignature: d.identitySignature,
          deviceName: d.deviceName,
          createdAt: d.createdAt,
          revoked: d.revoked
        }));

      res.json(activeDevices);
    } catch (error) {
      devLog('Error fetching devices:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get another user's active devices (for E2E fan-out encryption).
  // Requires authentication so unauthenticated actors cannot enumerate device lists.
  // Only non-sensitive public key material is returned — no private data.
  app.get("/api/users/:publicKey/devices", requireAuth, async (req, res) => {
    try {
      const { publicKey } = req.params;
      if (!publicKey || !validatePublicKey(publicKey)) {
        return res.status(400).json({ error: "Invalid public key" });
      }

      const devices = await storage.getDevices(publicKey.toLowerCase().trim());

      const activeDevices = devices
        .filter(d => !d.revoked)
        .map(d => ({
          devicePublicKey: d.devicePublicKey,
          identitySignature: d.identitySignature,
          userPublicKey: d.userPublicKey,
        }));

      res.json(activeDevices);
    } catch (error) {
      devLog('Error fetching user devices:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });


  // Register a new device

  app.post("/api/devices/register", requireAuthBootstrap, strictLimiter, async (req, res) => {
    try {
      // Support both camelCase (API standard) and snake_case (client expectation)
      const devicePublicKey = req.body.devicePublicKey || req.body.device_public_key;
      const deviceName = req.body.deviceName || req.body.device_name;
      const identitySignature = req.body.identity_signature || req.body.identitySignature;
      const userPublicKey = req.authPublicKey!;

      if (!devicePublicKey || !validatePublicKey(devicePublicKey)) {
        return res.status(400).json({ error: "Invalid device public key" });
      }

      // SEC-GUARD: Prevent registering the X25519 identity key as an Ed25519 device key.
      // These keys exist on different elliptic curves — conflating them corrupts the
      // authentication model and is always an indicator of a misconfigured or malicious client.
      if (devicePublicKey.toLowerCase().trim() === userPublicKey.toLowerCase().trim()) {
        logSecurityEvent({
          type: 'auth_failure',
          publicKey: userPublicKey,
          ip: req.ip || 'unknown',
          details: { reason: 'identity_key_as_device_key', devicePublicKey },
        });
        return res.status(400).json({ error: "Identity key cannot be used as a device key (key-curve separation required)" });
      }

      if (!identitySignature || typeof identitySignature !== 'string' || !/^[0-9a-f]{128}$/i.test(identitySignature)) {
        return res.status(400).json({ error: "Missing or invalid identity signature" });
      }

      const { ed25519 } = await import('@noble/curves/ed25519.js');
      const userRecord = await storage.getUser(userPublicKey);

      // CRIT-3 FIX: First device registration vs subsequent device linking.
      //
      // FIRST DEVICE (userRecord.devicePublicKey is null):
      //   The device being registered IS the identity signing key.
      //   The client self-signs: identity_signature = sign(devicePublicKey, devicePrivateKey)
      //   We verify: ed25519.verify(identitySignature, devicePublicKey, devicePublicKey)
      //
      // SUBSEQUENT DEVICE (userRecord.devicePublicKey is non-null):
      //   An existing trusted device endorses the new one.
      //   identity_signature = sign(newDevicePublicKey, existingIdentityPrivateKey)
      //   We verify: ed25519.verify(identitySignature, newDevicePublicKey, existingDevicePublicKey)
      const isFirstDevice = !userRecord?.devicePublicKey;
      const signingKey = isFirstDevice ? devicePublicKey : userRecord!.devicePublicKey!;
      // FIRST DEVICE: self-signed (TOFU — acceptable only when bound to server challenge via register-challenged).
      // SUBSEQUENT DEVICE: must be endorsed by the primary device key.

      // HIGH-A FIX: For subsequent devices, verify the endorsing key is ACTIVE (non-revoked).
      // A revoked primary device's private key must not be usable to endorse new devices.
      if (!isFirstDevice) {
          const endorsingDevice = await storage.getDeviceByPublicKey(signingKey);
          if (!endorsingDevice || endorsingDevice.revoked) {
              logSecurityEvent({
                type: 'auth_failure',
                publicKey: userPublicKey,
                ip: req.ip || 'unknown',
                details: { reason: 'endorsing_device_revoked', signingKey: signingKey.slice(0, 16) },
              });
              return res.status(401).json({ error: "Endorsing device has been revoked" });
          }
      }

      try {
        const sigBytes = new Uint8Array(identitySignature.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
        const msgBytes = new TextEncoder().encode(devicePublicKey);
        const signingKeyBytes = new Uint8Array(signingKey.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
        if (!ed25519.verify(sigBytes, msgBytes, signingKeyBytes)) {
            logSecurityEvent({
              type: 'auth_failure',
              publicKey: userPublicKey,
              ip: req.ip || 'unknown',
              details: { reason: 'identity_signature_invalid', isFirstDevice },
            });
            return res.status(401).json({ error: "Forged identity signature" });
        }
      } catch (err) {
        return res.status(401).json({ error: "Signature verification failed" });
      }

      if (deviceName && (typeof deviceName !== 'string' || deviceName.length > 50)) {
        return res.status(400).json({ error: "Invalid device name" });
      }

      const device = await storage.registerDevice({
        userPublicKey,
        devicePublicKey,
        identitySignature,
        deviceName: deviceName || 'New Device',
      });

      logSecurityEvent({
        type: 'device_management',
        publicKey: userPublicKey,
        ip: req.ip || 'unknown',
        details: { action: 'register_device', devicePublicKey },
      });

      res.json(device);
    } catch (error: any) {
      if (error?.message?.includes('Maximum device limit')) {
        return res.status(409).json({ error: error.message });
      }
      // Return 409 on unique-constraint violation so client can set its idempotency flag.
      const isDuplicate =
          error?.code === '23505' ||
          error?.message?.toLowerCase().includes('unique') ||
          error?.message?.toLowerCase().includes('duplicate key');
      if (isDuplicate) {
          return res.status(409).json({ error: "Device already registered" });
      }
      devLog('Error registering device:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Revoke a device
  app.post("/api/devices/revoke", requireAuth, strictLimiter, async (req, res) => {
    try {
      // Support both camelCase and snake_case
      const devicePublicKey = req.body.devicePublicKey || req.body.device_public_key;
      const userPublicKey = req.authPublicKey!;

      if (!devicePublicKey || !validatePublicKey(devicePublicKey)) {
        return res.status(400).json({ error: "Invalid device public key" });
      }

      const normalizedDeviceKey = devicePublicKey.toLowerCase().trim();
      const device = await storage.getDeviceByPublicKey(normalizedDeviceKey);
      if (!device || device.userPublicKey !== userPublicKey) {
        return res.status(404).json({ error: "Device not found" });
      }

      // MED-D FIX: Prevent revoking the last active device — it would permanently
      // lock the account with no authenticated path to recovery.
      const activeDevices = (await storage.getDevices(userPublicKey)).filter(d => !d.revoked);
      if (activeDevices.length <= 1) {
        return res.status(400).json({ error: "Cannot revoke your only active device" });
      }

      await storage.revokeDevice(devicePublicKey);

      logSecurityEvent({
        type: 'device_management',
        publicKey: userPublicKey,
        ip: req.ip || 'unknown',
        details: { action: 'revoke_device', devicePublicKey },
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== FRIEND CODES ====================

  // ==================== PREKEYS (X3DH) — DB-BACKED ====================

  const PREKEY_TTL_DAYS = 30;

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
      // SEC-FIX: Ensure the bundle belongs to the authenticated user
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
      devLog('Error uploading prekey bundle:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Fetch a user's prekey bundle — DB-backed, expires after 30 days
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
      devLog('Error fetching prekey bundle:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== DEVICE CHALLENGES ====================

  // Issue a challenge nonce for device registration (challenge-response)
  app.post("/api/devices/challenge", requireAuth, strictLimiter, async (req, res) => {
    try {
      const userPublicKey = req.authPublicKey!;
      // 32 random bytes as hex challenge
      const challengeBytes = new Uint8Array(32);
      crypto.getRandomValues(challengeBytes);
      const challenge = Array.from(challengeBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minute TTL

      await storage.createDeviceChallenge(userPublicKey, challenge, expiresAt);

      res.json({ challenge, expiresAt });
    } catch (error) {
      devLog('Error creating device challenge:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Verify challenge response and register device
  app.post("/api/devices/register-challenged", requireAuth, strictLimiter, async (req, res) => {
    try {
      const userPublicKey = req.authPublicKey!;
      const { devicePublicKey, deviceName, challenge, signature, identitySignature } = req.body;

      if (!devicePublicKey || !validatePublicKey(devicePublicKey)) {
        return res.status(400).json({ error: "Invalid device public key" });
      }
      if (!challenge || typeof challenge !== 'string' || !/^[0-9a-f]{64}$/i.test(challenge)) {
        return res.status(400).json({ error: "Invalid challenge format" });
      }
      if (!signature || typeof signature !== 'string' || !/^[0-9a-f]{128}$/i.test(signature)) {
        return res.status(400).json({ error: "Invalid signature format" });
      }
      if (!identitySignature || typeof identitySignature !== 'string' || !/^[0-9a-f]{128}$/i.test(identitySignature)) {
        return res.status(400).json({ error: "Missing identity signature" });
      }

      // P2-06: Consume challenge atomically — prevents replay & race conditions by checking userPublicKey in DB
      const challengeRecord = await storage.consumeDeviceChallenge(challenge, userPublicKey);
      if (!challengeRecord) {
        logSecurityEvent({
          type: 'device_management',
          publicKey: userPublicKey,
          ip: req.ip || 'unknown',
          details: { action: 'failed_challenge_verification', challenge },
        });
        return res.status(401).json({ error: "Invalid, expired, or previously used challenge" });
      }

      // Verify device signed the challenge with its own key (proves key ownership)
      const { ed25519 } = await import('@noble/curves/ed25519.js');
      const sigBytes = new Uint8Array(signature.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
      const challengeBytes = new TextEncoder().encode(challenge);
      const deviceKeyBytes = new Uint8Array(devicePublicKey.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));

      const isValid = ed25519.verify(sigBytes, challengeBytes, deviceKeyBytes);
      if (!isValid) {
        logSecurityEvent({
          type: 'auth_failure',
          publicKey: userPublicKey,
          ip: req.ip || 'unknown',
          details: { reason: 'device_challenge_signature_invalid', devicePublicKey },
        });
        return res.status(401).json({ error: "Device signature verification failed" });
      }
      
      try {
        const idSigBytes = new Uint8Array(identitySignature.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
        const msgBytes = new TextEncoder().encode(devicePublicKey);
        // SEC-FIX: Use the user's primary device public key (Ed25519 identity key) for verification.
        const dbUser = await storage.getUser(userPublicKey);
        if (!dbUser || !dbUser.devicePublicKey) {
            return res.status(401).json({ error: "User identity key missing" });
        }
        const identityKeyBytes = new Uint8Array(dbUser.devicePublicKey.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
        if (!ed25519.verify(idSigBytes, msgBytes, identityKeyBytes)) {
            return res.status(401).json({ error: "Forged identity signature" });
        }
      } catch (err) {
        return res.status(401).json({ error: "Identity signature verification failed" });
      }

      const device = await storage.registerDevice({
        userPublicKey,
        devicePublicKey,
        identitySignature,
        deviceName: deviceName || 'New Device',
      });

      logSecurityEvent({
        type: 'device_management',
        publicKey: userPublicKey,
        ip: req.ip || 'unknown',
        details: { action: 'register_device_challenged', devicePublicKey },
      });

      res.json(device);
    } catch (error: any) {
      if (error?.message?.includes('Maximum device limit')) {
        return res.status(409).json({ error: error.message });
      }
      devLog('Error registering challenged device:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== DEVICE LINKING ====================

  // Start a linking request from a new device (unauthenticated)
  app.post("/api/link/request", strictLimiter, async (req, res) => {
    try {
      const { userPublicKey, devicePublicKey, deviceName } = req.body;

      if (!userPublicKey || !validatePublicKey(userPublicKey)) {
        return res.status(400).json({ error: "Invalid user public key format (64-char hex expected)" });
      }
      if (!devicePublicKey || !validatePublicKey(devicePublicKey)) {
        return res.status(400).json({ error: "Invalid device public key format" });
      }

      // CRIT-1 FIX: Do NOT auto-create users here. This endpoint is unauthenticated,
      // and silently creating user records from arbitrary keys is an identity injection
      // backdoor. The account MUST already exist (primary device registered) before
      // a new device can request linking.
      const user = await storage.getUser(userPublicKey);
      if (!user) {
        return res.status(404).json({ error: "Identity not found. Register a primary device first." });
      }

      // H-2 FIX: Limit pending linking requests per target user to prevent
      // flooding and device-key squatting attacks on this unauthenticated endpoint.
      const pendingRequests = await storage.getPendingLinkingRequests(userPublicKey.toLowerCase().trim());
      if (pendingRequests.length >= 5) {
        return res.status(429).json({ error: "Too many pending linking requests. Try again later." });
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minute TTL

      const request = await storage.createLinkingRequest({
        userPublicKey: userPublicKey.toLowerCase().trim(),
        devicePublicKey: devicePublicKey.toLowerCase().trim(),
        deviceName: deviceName || 'New Device',
        expiresAt,
      });

      res.json(request);
    } catch (error) {
      devLog('Error creating linking request:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get status of a linking request (unauthenticated polling)
  app.get("/api/link/status/:devicePublicKey", strictLimiter, async (req, res) => {
    try {
      const { devicePublicKey } = req.params;
      if (!validatePublicKey(devicePublicKey)) {
        return res.status(400).json({ error: "Invalid device public key" });
      }
      const request = await storage.getLinkingRequestByDevice(devicePublicKey.toLowerCase().trim());

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      // Return the approval payload when approved.
      // encryptedIdentity is AES-256-GCM encrypted (E2E) — only decryptable by the device
      // that holds the matching private key. identitySignature is a Ed25519 signature over
      // the new device's public key — non-forgeable. Neither field leaks sensitive data to
      // a passive observer without key material.
      const responsePayload: Record<string, unknown> = {
        id: request.id,
        status: request.status,
        expiresAt: request.expiresAt,
      };
      if (request.status === 'approved') {
        responsePayload.encryptedIdentity = request.encryptedIdentity;
        responsePayload.identitySignature = request.identitySignature;
      }
      res.json(responsePayload);
    } catch (error) {
      devLog('Error getting linking status:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // List pending linking requests for current user (authenticated)
  app.get("/api/link/requests", requireAuth, async (req, res) => {
    try {
      const userPublicKey = req.authPublicKey!;
      const requests = await storage.getPendingLinkingRequests(userPublicKey);
      res.json(requests);
    } catch (error) {
      devLog('Error listing linking requests:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Approve a linking request (authenticated)
  app.post("/api/link/approve", requireAuth, strictLimiter, async (req, res) => {
    try {
      const { requestId, identitySignature, encryptedIdentity, deviceName } = req.body;
      const userPublicKey = req.authPublicKey!;

      if (!requestId) return res.status(400).json({ error: "Missing request ID" });
      
      const request = await storage.getLinkingRequest(requestId);
      if (!request || request.userPublicKey !== userPublicKey) {
        return res.status(404).json({ error: "Request not found" });
      }

      if (!identitySignature || !encryptedIdentity) {
        return res.status(400).json({ error: "Missing approval payloads" });
      }

      // Validate identity signature format
      if (!/^[0-9a-f]{128}$/i.test(identitySignature)) {
        return res.status(400).json({ error: "Invalid identity signature format" });
      }

      await storage.approveLinkingRequest(requestId, identitySignature, encryptedIdentity);

      // Register the new device immediately so it appears in managed devices.
      // The signature is Alice's Ed25519 sign over Bob's device public key —
      // the same credential /api/devices/register would verify independently.
      try {
        await storage.registerDevice({
          userPublicKey,
          devicePublicKey: request.devicePublicKey,
          identitySignature,
          deviceName: request.deviceName || deviceName || 'Linked Device',
        });
      } catch (regErr: any) {
        // Non-fatal if already registered (conflict)
        devLog('Device auto-registration on approve (non-fatal):', regErr);
      }

      logSecurityEvent({
        type: 'device_management',
        publicKey: userPublicKey,
        ip: req.ip || 'unknown',
        details: { action: 'approve_linking_request', devicePublicKey: request.devicePublicKey },
      });

      res.json({ success: true });
    } catch (error) {
      devLog('Error approving linking request:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reject a linking request (authenticated)
  app.post("/api/link/reject", requireAuth, strictLimiter, async (req, res) => {
    try {
      const { requestId } = req.body;
      const userPublicKey = req.authPublicKey!;

      if (!requestId) return res.status(400).json({ error: "Missing request ID" });

      const request = await storage.getLinkingRequest(requestId);
      if (!request || request.userPublicKey !== userPublicKey) {
        return res.status(404).json({ error: "Request not found" });
      }

      await storage.rejectLinkingRequest(requestId);
      res.json({ success: true });
    } catch (error) {
      devLog('Error rejecting linking request:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== FRIEND CODES ====================

  // Create a new friend code

  app.post("/api/friend-codes", requireAuth, strictLimiter, async (req, res) => {
    try {
      const { code, expiresAt } = req.body;
      const identityPublicKey = req.authPublicKey!;

      if (!code || !validateFriendCode(code)) {
        return res.status(400).json({ error: "Invalid friend code format" });
      }

      // identityPublicKey is derived from authenticated identity — no body validation needed

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
      devLog('Error creating friend code:', error);
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

      // SEC-FIX-7: Atomic redemption — check, mark-used, and create friendships
      // in a single storage call to prevent TOCTOU race conditions
      try {
        const result = await storage.redeemFriendCode(code, redeemerPublicKey);
        res.json({
          success: true,
          friendPublicKey: result.friendPublicKey
        });
      } catch (err: any) {
        const msg = err?.message || '';
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
      devLog('Error redeeming friend code:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

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
      devLog('Error getting friend requests:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Accept a friend request (FIX 5: friendName removed — stored client-side only)
  app.post("/api/friend-requests/accept", requireAuth, strictLimiter, async (req, res) => {
    try {
      const rawFriendKey = req.body.friendPublicKey;
      const userPublicKey = req.authPublicKey!;

      if (!rawFriendKey || !validatePublicKey(rawFriendKey)) {
        return res.status(400).json({ error: "Invalid friend public key" });
      }

      // Normalize after validation
      const friendPublicKey = rawFriendKey.toLowerCase().trim();

      await storage.acceptFriendRequest(userPublicKey, friendPublicKey);

      res.json({ success: true, friendPublicKey });

      // Notify both parties about the accepted friend request
      notifyFriendEvent(friendPublicKey, 'friend_accepted');
      notifyFriendEvent(userPublicKey, 'friend_accepted');
    } catch (error) {
      devLog('Error accepting friend request:', error);
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

      // Normalize after validation
      const friendPublicKey = rawFriendKey.toLowerCase().trim();

      await storage.declineFriendRequest(userPublicKey, friendPublicKey);

      res.json({ success: true });
    } catch (error) {
      devLog('Error declining friend request:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== FRIENDS ====================

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

      // Enrich friends with their display names from the users table
      const enrichedFriends = await Promise.all(
        friends.map(async (friend) => {
          const friendUser = await storage.getUser(friend.friendPublicKey);
          return {
            ...friend,
            friendDisplayName: friendUser?.displayName || null,
          };
        })
      );

      res.json(enrichedFriends);
    } catch (error) {
      devLog('Error getting friends:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== MESSAGES ====================

  // Send a message
  app.post("/api/messages", requireAuth, messageLimiter, async (req, res) => {
    const {
      encryptedPayloads,
      ttlSeconds,
    } = req.body;
    const senderPublicKey = req.authPublicKey!;

    try {

      // Validate required fields — senderPublicKey derived from auth
      const rawReceiverKey = req.body.receiverPublicKey;
      if (!rawReceiverKey || !validatePublicKey(rawReceiverKey)) {
        return res.status(400).json({ error: "Invalid receiver public key" });
      }
      // Normalize after validation to prevent case-mismatch exploits
      const receiverPublicKey = rawReceiverKey.toLowerCase().trim();

      // SEC-HARDEN: Prevent sending messages to yourself
      if (senderPublicKey === receiverPublicKey) {
        return res.status(400).json({ error: "Cannot send messages to yourself" });
      }

      if (!encryptedPayloads || !Array.isArray(encryptedPayloads) || encryptedPayloads.length === 0) {
        return res.status(400).json({ error: "Missing or invalid encrypted payloads" });
      }

      // SEC-STABLE-04: Bound fan-out payloads — no user should need 20+ device targets
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
      }

      // SEC-FIX-4: Validate TTL against strict allowed list — server controls expiresAt
      const ALLOWED_TTL = [30, 300, 3600, 21600, 43200, 86400];
      if (!ttlSeconds || typeof ttlSeconds !== 'number' || !ALLOWED_TTL.includes(Number(ttlSeconds))) {
        return res.status(400).json({ error: "Invalid TTL value" });
      }

      // Server-calculated expiry — client expiresAt is ignored entirely
      const expiresAt = new Date(Date.now() + Number(ttlSeconds) * 1000);
      
      // Check if sender is blocked by receiver
      const isBlocked = await storage.isBlocked(receiverPublicKey, senderPublicKey);
      if (isBlocked) {
        // Silently succeed to prevent enumeration
        return res.json({ success: true });
      }

      const message = await storage.createMessage({
        senderPublicKey,
        receiverPublicKey,
        encryptedPayloads: JSON.stringify(encryptedPayloads),
        ttlSeconds,
        expiresAt,
      });

      res.json({ success: true, messageId: message.id });

      // Push instant notification to receiver via WebSocket
      // Only sends a signal — no message content (preserves E2E security)
      notifyNewMessage(receiverPublicKey, senderPublicKey);
    } catch (error: any) {
      if (error?.code === 'DUPLICATE_MESSAGE') {
        logSecurityEvent({
          type: 'replay_attempt',
          publicKey: req.authPublicKey!,
          ip: req.ip || 'unknown',
          details: { senderPublicKey, receiverPublicKey: req.body.receiverPublicKey },
        });
        return res.status(409).json({ error: "Duplicate message rejected" });
      }

      devLog('Error sending message:', error);
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

      // Get blocked users to filter messages
      const blockedUsers = await storage.getBlockedUsers(userPublicKey);

      const messages = await storage.getMessages(userPublicKey, friendPublicKey);

      // Filter out messages from blocked users
      const filteredMessages = messages.filter(
        (msg) => !blockedUsers.includes(msg.senderPublicKey)
      );

      res.json(filteredMessages);
    } catch (error) {
      devLog('Error getting messages:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== BLOCKLIST ====================

  // Block a user
  app.post("/api/block", requireAuth, strictLimiter, async (req, res) => {
    try {
      const rawBlockedKey = req.body.blockedPublicKey;
      const blockerPublicKey = req.authPublicKey!;

      // blockerPublicKey is derived from authenticated identity — no body validation needed

      if (!rawBlockedKey || !validatePublicKey(rawBlockedKey)) {
        return res.status(400).json({ error: "Invalid blocked public key" });
      }

      // Normalize after validation to prevent case-mismatch exploits
      const blockedPublicKey = rawBlockedKey.toLowerCase().trim();

      // SEC-HARDEN: Prevent self-blocking
      if (blockerPublicKey === blockedPublicKey) {
        return res.status(400).json({ error: "Cannot block yourself" });
      }

      await storage.blockUser({ blockerPublicKey, blockedPublicKey });

      res.json({ success: true });
    } catch (error) {
      devLog('Error blocking user:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Unblock a user
  app.post("/api/unblock", requireAuth, strictLimiter, async (req, res) => {
    try {
      const rawBlockedKey = req.body.blockedPublicKey;
      const blockerPublicKey = req.authPublicKey!;

      // blockerPublicKey is derived from authenticated identity — no body validation needed

      if (!rawBlockedKey || !validatePublicKey(rawBlockedKey)) {
        return res.status(400).json({ error: "Invalid blocked public key" });
      }

      // Normalize after validation
      const blockedPublicKey = rawBlockedKey.toLowerCase().trim();

      await storage.unblockUser(blockerPublicKey, blockedPublicKey);

      res.json({ success: true });
    } catch (error) {
      devLog('Error unblocking user:', error);
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
      devLog('Error getting blocked users:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
