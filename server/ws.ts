/**
 * WebSocket Notification Server
 * 
 * Lightweight push notification layer for instant message delivery.
 * Only sends notification signals — NO message content over WebSocket.
 * Clients react by invalidating their React Query cache, triggering
 * an authenticated HTTP fetch through the existing secure pipeline.
 * 
 * This preserves the E2E encryption security model while eliminating
 * polling delay (0-2s → <100ms).
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { log } from './index';

// Map of publicKey → Set of connected WebSocket clients
const clients = new Map<string, Set<WebSocket>>();

let wss: WebSocketServer | null = null;

export function setupWebSocket(server: Server) {
  wss = new WebSocketServer({ 
    server, 
    path: '/ws/notifications',
    // Reject connections without a public key identifier
    verifyClient: (info: { req: { url?: string; headers: { host?: string } } }) => {
      const url = new URL(info.req.url || '', `http://${info.req.headers.host}`);
      const pk = url.searchParams.get('pk');
      // Basic validation: must be a 64-char hex string
      return !!pk && /^[0-9a-f]{64}$/i.test(pk);
    }
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const publicKey = url.searchParams.get('pk')?.toLowerCase().trim();
    
    if (!publicKey) {
      ws.close(4001, 'Missing public key');
      return;
    }

    // Register this connection
    if (!clients.has(publicKey)) {
      clients.set(publicKey, new Set());
    }
    clients.get(publicKey)!.add(ws);

    log(`WS connected: ${publicKey.slice(0, 12)}... (${clients.get(publicKey)!.size} connections)`, 'ws');

    // Heartbeat to keep connection alive
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => {
      const set = clients.get(publicKey);
      if (set) {
        set.delete(ws);
        if (set.size === 0) clients.delete(publicKey);
      }
    });

    ws.on('error', () => {
      ws.terminate();
    });

    // Send a welcome message to confirm connection
    ws.send(JSON.stringify({ type: 'connected' }));
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

  log('WebSocket notification server ready on /ws/notifications', 'ws');
}

/**
 * Notify a user that they have new messages.
 * Called from the message POST route after successful storage.
 * 
 * Only sends a signal with the sender's public key — NO message content.
 * The client reacts by invalidating its React Query cache.
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

// Extend WebSocket type for heartbeat
declare module 'ws' {
  interface WebSocket {
    isAlive: boolean;
  }
}
