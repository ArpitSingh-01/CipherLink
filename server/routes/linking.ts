/**
 * Linking routes — request linking new devices, approve/reject requests, and check linking status.
 */
import type { Express } from 'express';
import { requireAuth } from '../middleware/auth';
import { storage } from '../storage';
import { validatePublicKey } from '../utils/validate';
import { hexToBytes } from '../utils/bytes';
import { logSecurityEvent } from '../logger/security';
import { logError } from '../utils/log';
import { strictLimiter } from '../utils/rateLimiters';

export function registerLinkingRoutes(app: Express): void {
  // ── Device Linking ────────────────────────────────────────────────────────────

  // Request to link a new device (unauthenticated)
  app.post("/api/link/request", strictLimiter, async (req, res) => {
    try {
      const { userPublicKey, devicePublicKey, deviceName } = req.body;

      if (!userPublicKey || !validatePublicKey(userPublicKey)) {
        return res.status(400).json({ error: "Invalid user public key format (64-char hex expected)" });
      }
      if (!devicePublicKey || !validatePublicKey(devicePublicKey)) {
        return res.status(400).json({ error: "Invalid device public key format" });
      }

      const user = await storage.getUser(userPublicKey);
      if (!user) {
        return res.status(404).json({ error: "Identity not found. Register a primary device first." });
      }

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
      logError('createLinkingRequest', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get status of a linking request (device proof-of-possession required)
  app.get("/api/link/status/:devicePublicKey", strictLimiter, async (req, res) => {
    try {
      const { devicePublicKey } = req.params;
      if (!validatePublicKey(devicePublicKey)) {
        return res.status(400).json({ error: "Invalid device public key" });
      }

      const linkSignature = req.headers['x-link-signature'] as string | undefined;
      if (!linkSignature || !/^[0-9a-f]{128}$/i.test(linkSignature)) {
        return res.status(401).json({ error: "Missing or invalid device proof" });
      }

      try {
        const { ed25519 } = await import('@noble/curves/ed25519.js');
        const sigBytes = hexToBytes(linkSignature);
        const msgBytes = new TextEncoder().encode(devicePublicKey.toLowerCase().trim());
        const pubBytes = hexToBytes(devicePublicKey.toLowerCase().trim());
        const isValid = ed25519.verify(sigBytes, msgBytes, pubBytes);
        if (!isValid) {
          return res.status(401).json({ error: "Invalid device proof" });
        }
      } catch {
        return res.status(401).json({ error: "Invalid device proof" });
      }

      const request = await storage.getLinkingRequestByDevice(devicePublicKey.toLowerCase().trim());

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

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
      logError('getLinkingStatus', error);
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
      logError('listLinkingRequests', error);
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

      if (!/^[0-9a-f]{128}$/i.test(identitySignature)) {
        return res.status(400).json({ error: "Invalid identity signature format" });
      }

      await storage.approveLinkingRequest(requestId, identitySignature, encryptedIdentity);

      try {
        await storage.registerDevice({
          userPublicKey,
          devicePublicKey: request.devicePublicKey,
          identitySignature,
          deviceName: request.deviceName || deviceName || 'Linked Device',
        });
      } catch (regErr: any) {
        logError('deviceAutoRegistrationOnApprove', regErr);
      }

      logSecurityEvent({
        type: 'device_management',
        publicKey: userPublicKey,
        ip: req.ip || 'unknown',
        details: { action: 'approve_linking_request', devicePublicKey: request.devicePublicKey },
      });

      res.json({ success: true });
    } catch (error) {
      logError('approveLinkingRequest', error);
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
      logError('rejectLinkingRequest', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
