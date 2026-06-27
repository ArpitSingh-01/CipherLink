/**
 * Device routes — fetch active devices, register new devices via challenge-response, and revoke devices.
 */
import type { Express } from 'express';
import { requireAuth, requireAuthBootstrap } from '../middleware/auth';
import { storage } from '../storage';
import { validatePublicKey } from '../utils/validate';
import { hexToBytes } from '../utils/bytes';
import { logSecurityEvent } from '../logger/security';
import { logError } from '../utils/log';
import { strictLimiter } from '../utils/rateLimiters';

export function registerDeviceRoutes(app: Express): void {
  // ── Devices ───────────────────────────────────────────────────────────────────

  // Get user's active devices
  app.get("/api/devices", requireAuth, async (req, res) => {
    try {
      const userPublicKey = req.authPublicKey!;
      const devices = await storage.getDevices(userPublicKey);
      
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
      logError('fetchDevices', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get another user's active devices (for E2E fan-out encryption)
  app.get("/api/users/:publicKey/devices", requireAuth, async (req, res) => {
    try {
      const { publicKey } = req.params;
      if (!publicKey || !validatePublicKey(publicKey)) {
        return res.status(400).json({ error: "Invalid public key" });
      }

      const normalizedTarget = publicKey.toLowerCase().trim();
      const requestingKey = req.authPublicKey!;

      const isSelf = requestingKey === normalizedTarget;
      const isFriend = !isSelf && await storage.areMutualFriends(requestingKey, normalizedTarget);

      if (!isSelf && !isFriend) {
        return res.status(404).json({ error: 'Not found' });
      }

      const devices = await storage.getDevices(normalizedTarget);

      const activeDevices = devices
        .filter(d => !d.revoked)
        .map(d => ({
          devicePublicKey: d.devicePublicKey,
          identitySignature: d.identitySignature,
          userPublicKey: d.userPublicKey,
        }));

      res.json(activeDevices);
    } catch (error) {
      logError('fetchUserDevices', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Register a new device (un-challenged backup endpoint)
  app.post("/api/devices/register", requireAuthBootstrap, strictLimiter, async (req, res) => {
    try {
      const devicePublicKey = req.body.devicePublicKey || req.body.device_public_key;
      const deviceName = req.body.deviceName || req.body.device_name;
      const identitySignature = req.body.identity_signature || req.body.identitySignature;
      const userPublicKey = req.authPublicKey!;

      if (!devicePublicKey || !validatePublicKey(devicePublicKey)) {
        return res.status(400).json({ error: "Invalid device public key" });
      }

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

      const isFirstDevice = !userRecord?.devicePublicKey;
      const signingKey = isFirstDevice ? devicePublicKey : userRecord!.devicePublicKey!;

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
        const sigBytes = hexToBytes(identitySignature);
        const msgBytes = new TextEncoder().encode(devicePublicKey);
        const signingKeyBytes = hexToBytes(signingKey);
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
      const isDuplicate =
        error?.code === '23505' ||
        error?.message?.toLowerCase().includes('unique') ||
        error?.message?.toLowerCase().includes('duplicate key');
      if (isDuplicate) {
        return res.status(409).json({ error: "Device already registered" });
      }
      logError('registerDevice', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Revoke a device
  app.post("/api/devices/revoke", requireAuth, strictLimiter, async (req, res) => {
    try {
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

      const activeDevices = (await storage.getDevices(userPublicKey)).filter(d => !d.revoked);
      if (activeDevices.length <= 1) {
        return res.status(400).json({ error: "Cannot revoke your only active device" });
      }

      await storage.revokeDevice(devicePublicKey);

      const updatedUser = await storage.getUser(req.authPublicKey!);
      if (updatedUser && updatedUser.devicePublicKey === normalizedDeviceKey) {
        const remainingDevices = await storage.getDevices(req.authPublicKey!);
        const newPrimary = remainingDevices.find(
          d => !d.revoked && d.devicePublicKey !== normalizedDeviceKey
        );
        if (newPrimary) {
          await storage.updateUserPrimaryDevice(req.authPublicKey!, newPrimary.devicePublicKey);
        }
      }

      logSecurityEvent({
        type: 'device_management',
        publicKey: userPublicKey,
        ip: req.ip || 'unknown',
        details: { action: 'revoke_device', devicePublicKey },
      });

      res.json({ success: true });
    } catch (error) {
      logError('revokeDevice', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Device Challenges ─────────────────────────────────────────────────────────

  // Issue a challenge nonce for device registration
  app.post("/api/devices/challenge", requireAuth, strictLimiter, async (req, res) => {
    try {
      const userPublicKey = req.authPublicKey!;
      const challengeBytes = new Uint8Array(32);
      crypto.getRandomValues(challengeBytes);
      const challenge = Array.from(challengeBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minute TTL

      await storage.createDeviceChallenge(userPublicKey, challenge, expiresAt);

      res.json({ challenge, expiresAt });
    } catch (error) {
      logError('createChallenge', error);
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

      const { ed25519 } = await import('@noble/curves/ed25519.js');
      const sigBytes = hexToBytes(signature);
      const challengeBytes = new TextEncoder().encode(challenge);
      const deviceKeyBytes = hexToBytes(devicePublicKey);

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
        const idSigBytes = hexToBytes(identitySignature);
        const msgBytes = new TextEncoder().encode(devicePublicKey);
        const dbUser = await storage.getUser(userPublicKey);
        if (!dbUser || !dbUser.devicePublicKey) {
          return res.status(401).json({ error: "User identity key missing" });
        }
        const identityKeyBytes = hexToBytes(dbUser.devicePublicKey);
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
      logError('registerChallenged', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
