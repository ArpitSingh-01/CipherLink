/**
 * WebSocket Notification Server — Authenticated (FIX 2-A)
 * 
 * Ed25519 challenge-response authentication replaces the previous
 * unauthenticated subscribe-by-publicKey model.
 * 
 * Protocol:
 *   1. Client connects to /ws/notifications?pk=<identityPublicKey>
 *   2. Server sends: {"type":"challenge","nonce":"<64 hex chars>"}
 *   3. Client signs nonce with their Ed25519 device private key and responds:
 *      {"type":"challenge_response","signature":"<128 hex>","devicePublicKey":"<64 hex>"}
 *   4. Server verifies: ed25519.verify(sig, nonce, devicePublicKey)
 *      AND confirms devicePublicKey belongs to the pk identity (via storage)
 *   5. On success: {"type":"connected"} — client is subscribed to notifications
 *   6. On failure: close(4003) — authentication failed
 *   7. On timeout (5s): close(4002) — authentication timeout
 *
 * Security:
 *   - Per-IP connection limit (MAX_CONNS_PER_IP = 5)
 *   - 5-second auth timeout — unauthenticated sockets cannot linger
 *   - Only authenticated sockets receive notifications
 *   - NO message content flows through WebSocket — pure signal channel
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { log } from './log';
import { ed25519 } from '@noble/curves/ed25519.js';

// Authenticated subscriber map: publicKey → Set<WebSocket>
const clients = new Map<string, Set<WebSocket>>();

// Pending challenge state per-socket
interface PendingChallenge {
  nonce: string;
  publicKey: string;
  timer: ReturnType<typeof setTimeout>;
}
export const pendingChallenges = new Map<WebSocket, PendingChallenge>();

// Per-IP connection tracking for DoS protection
const connectionsPerIP = new Map<string, number>();
const MAX_CONNS_PER_IP = 5;
const AUTH_TIMEOUT_MS = 5000;

let wss: WebSocketServer | null = null;

/**
 * Convert a hex string to Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Generate a cryptographically random 32-byte hex nonce.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Lazy-loaded storage reference to avoid circular imports
let storageRef: any = null;
async function getStorage() {
  if (!storageRef) {
    // Dynamic import breaks the circular dependency chain
    const mod = await import('./storage.js');
    storageRef = (mod as any).storage;
  }
  return storageRef;
}

export function setupWebSocket(server: Server) {
  wss = new WebSocketServer({
    server,
    path: '/ws/notifications',
    // Basic format validation only — auth happens after connection
    verifyClient: (info: { req: { url?: string; headers: { host?: string }; socket?: { remoteAddress?: string } } }) => {
      const url = new URL(info.req.url || '', `http://${info.req.headers.host}`);
      const pk = url.searchParams.get('pk');
      if (!pk || !/^[0-9a-f]{64}$/i.test(pk)) return false;

      // Per-IP connection limit
      const ip = info.req.socket?.remoteAddress || 'unknown';
      const count = connectionsPerIP.get(ip) || 0;
      if (count >= MAX_CONNS_PER_IP) {
        return false; // Reject — will close with default code
      }
      return true;
    }
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const publicKey = url.searchParams.get('pk')?.toLowerCase().trim();
    const ip = req.socket.remoteAddress || 'unknown';

    if (!publicKey) {
      ws.close(4001, 'Missing public key');
      return;
    }

    // Track per-IP connections
    const currentCount = connectionsPerIP.get(ip) || 0;
    if (currentCount >= MAX_CONNS_PER_IP) {
      ws.close(4029, 'Too many connections');
      return;
    }
    connectionsPerIP.set(ip, currentCount + 1);

    // Issue Ed25519 challenge
    const nonce = generateNonce();
    const authTimer = setTimeout(() => {
      // Authentication timeout — close unauthenticated socket
      pendingChallenges.delete(ws);
      ws.close(4002, 'Authentication timeout');
    }, AUTH_TIMEOUT_MS);

    pendingChallenges.set(ws, { nonce, publicKey, timer: authTimer });

    // Send challenge to client
    ws.send(JSON.stringify({ type: 'challenge', nonce }));

    // Heartbeat
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'challenge_response') {
          const pending = pendingChallenges.get(ws);
          if (!pending) {
            ws.close(4003, 'No pending challenge');
            return;
          }

          const { signature, devicePublicKey } = msg;
          if (!signature || !devicePublicKey ||
              !/^[0-9a-f]{128}$/i.test(signature) ||
              !/^[0-9a-f]{64}$/i.test(devicePublicKey)) {
            clearTimeout(pending.timer);
            pendingChallenges.delete(ws);
            ws.close(4003, 'Authentication failed');
            return;
          }

          try {
            // Verify Ed25519 signature: sign(nonce_bytes, devicePrivateKey) → verify(sig, nonce_bytes, devicePublicKey)
            const nonceBytes = hexToBytes(pending.nonce);
            const sigBytes = hexToBytes(signature);
            const devicePubBytes = hexToBytes(devicePublicKey.toLowerCase());

            const isValid = ed25519.verify(sigBytes, nonceBytes, devicePubBytes);
            if (!isValid) {
              clearTimeout(pending.timer);
              pendingChallenges.delete(ws);
              ws.close(4003, 'Authentication failed');
              return;
            }

            // Verify device belongs to the claimed identity
            const storage = await getStorage();
            if (storage) {
              const device = await storage.getDeviceByPublicKey(devicePublicKey.toLowerCase());
              if (!device || device.userPublicKey !== pending.publicKey || device.revoked) {
                clearTimeout(pending.timer);
                pendingChallenges.delete(ws);
                ws.close(4003, 'Authentication failed');
                return;
              }
            }

            // Authentication successful
            clearTimeout(pending.timer);
            pendingChallenges.delete(ws);

            // Register in authenticated subscriber map
            if (!clients.has(pending.publicKey)) {
              clients.set(pending.publicKey, new Set());
            }
            clients.get(pending.publicKey)!.add(ws);

            log(`WS authenticated: ${pending.publicKey.slice(0, 12)}... (${clients.get(pending.publicKey)!.size} conns)`, 'ws');
            ws.send(JSON.stringify({ type: 'connected' }));
          } catch {
            clearTimeout(pending.timer);
            pendingChallenges.delete(ws);
            ws.close(4003, 'Authentication failed');
          }
        }
        // Ignore any other message types from clients
      } catch {
        // Malformed JSON — ignore
      }
    });

    ws.on('close', () => {
      // Clean up pending challenge if still pending
      const pending = pendingChallenges.get(ws);
      if (pending) {
        clearTimeout(pending.timer);
        pendingChallenges.delete(ws);
      }

      // Remove from authenticated subscribers
      const allEntries = Array.from(clients.entries());
      for (const [key, set] of allEntries) {
        set.delete(ws);
        if (set.size === 0) clients.delete(key);
      }

      // Decrement per-IP counter
      const count = connectionsPerIP.get(ip) || 1;
      if (count <= 1) {
        connectionsPerIP.delete(ip);
      } else {
        connectionsPerIP.set(ip, count - 1);
      }
    });

    ws.on('error', () => {
      ws.terminate();
    });
  });

  // Heartbeat interval — ping every 30s, terminate dead connections
  const heartbeat = setInterval(() => {
    wss?.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  log('WebSocket notification server ready on /ws/notifications (Ed25519 challenge auth)', 'ws');
}

/**
 * Notify a user that they have new messages.
 * Only sends to AUTHENTICATED connections.
 * Only sends a signal — NO message content (preserves E2E security).
 */
export function notifyNewMessage(receiverPublicKey: string, senderPublicKey: string) {
  const normalizedKey = receiverPublicKey.toLowerCase().trim();
  const connections = clients.get(normalizedKey);

  if (!connections || connections.size === 0) return;

  const notification = JSON.stringify({
    type: 'new_message',
    from: senderPublicKey.slice(0, 16), // Truncated — sufficient for cache invalidation
    t: Date.now(),
  });

  connections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(notification);
    }
  });
}

/**
 * Notify a user about friend-related events (new request, accepted, etc.)
 */
export function notifyFriendEvent(targetPublicKey: string, eventType: 'friend_request' | 'friend_accepted') {
  const normalizedKey = targetPublicKey.toLowerCase().trim();
  const connections = clients.get(normalizedKey);

  if (!connections || connections.size === 0) return;

  const notification = JSON.stringify({
    type: eventType,
    t: Date.now(),
  });

  connections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(notification);
    }
  });
}

/**
 * Notify a user about typing events — ephemeral, never stored.
 * Only delivered to AUTHENTICATED connections.
 */
export function notifyTyping(targetPublicKey: string, senderPublicKey: string, isTyping: boolean) {
  const normalizedKey = targetPublicKey.toLowerCase().trim();
  const connections = clients.get(normalizedKey);

  if (!connections || connections.size === 0) return;

  const notification = JSON.stringify({
    type: 'typing',
    from: senderPublicKey.slice(0, 16),
    isTyping,
  });

  connections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(notification);
    }
  });
}

/**
 * Notify a specific user — generic push. Used by routes for custom events.
 */
export function notifyUser(publicKey: string, payload: Record<string, unknown>) {
  const normalizedKey = publicKey.toLowerCase().trim();
  const connections = clients.get(normalizedKey);

  if (!connections || connections.size === 0) return;

  const message = JSON.stringify(payload);
  connections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// Extend WebSocket type for heartbeat
declare module 'ws' {
  interface WebSocket {
    isAlive: boolean;
  }
}
