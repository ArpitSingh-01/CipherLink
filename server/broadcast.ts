/**
 * Supabase Realtime Broadcast — Server-Side
 * 
 * Sends notification signals to connected clients via Supabase Realtime
 * Broadcast REST API. This replaces the ws.ts WebSocket server for
 * production (Vercel serverless), while ws.ts continues to work for
 * local development.
 * 
 * Architecture:
 * - Server POSTs a tiny broadcast signal to Supabase Realtime REST API
 * - Supabase pushes it to all clients subscribed to that channel
 * - Clients invalidate their React Query cache and fetch fresh data
 * - NO message content flows through this channel — pure signal
 * 
 * This is a single HTTP POST per event — works perfectly in serverless.
 */

import { log } from './log';
import { config } from './config';

const SUPABASE_URL = config.supabase.url;
const AUTH_KEY = config.supabase.serviceKey || config.supabase.anonKey;

// Validate at startup — at minimum the anon key must be set
if (!SUPABASE_URL || !AUTH_KEY) {
  console.warn('[broadcast] SUPABASE_URL or SUPABASE_ANON_KEY not set — realtime broadcast disabled');
}

/**
 * Send a broadcast signal via Supabase Realtime REST API.
 * Fire-and-forget — never blocks the response.
 */
async function broadcastSignal(
  channelTopic: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!SUPABASE_URL || !AUTH_KEY) return;

  try {
    const response = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': AUTH_KEY,
        'Authorization': `Bearer ${AUTH_KEY}`,
      },
      body: JSON.stringify({
        messages: [{
          topic: channelTopic,
          event: 'signal',
          payload,
        }],
      }),
    });

    if (!response.ok) {
      // Log but never throw — broadcast failure must not break message delivery
      const text = await response.text().catch(() => 'unknown');
      log(`Broadcast failed (${response.status}): ${text}`, 'broadcast');
    }
  } catch (error) {
    // Network errors are non-fatal — polling fallback catches missed signals
    log(`Broadcast error: ${error}`, 'broadcast');
  }
}

/**
 * Notify a user that they have new messages.
 * Called from the message POST route after successful storage.
 * 
 * Only sends a signal with the sender's truncated public key — NO message content.
 */
export function notifyNewMessage(receiverPublicKey: string, senderPublicKey: string): void {
  const normalizedKey = receiverPublicKey.toLowerCase().trim();
  const channelTopic = `notifications:${normalizedKey}`;

  // Fire-and-forget — never blocks the API response
  broadcastSignal(channelTopic, {
    type: 'new_message',
    from: senderPublicKey.slice(0, 16), // Truncated — sufficient for cache invalidation
    t: Date.now(),
  }).catch(() => {}); // Swallow any unhandled rejections
}

/**
 * Notify a user about friend-related events (new request, accepted, etc.)
 */
export function notifyFriendEvent(
  targetPublicKey: string,
  eventType: 'friend_request' | 'friend_accepted' | 'typing' // BUG-9 FIX: added typing
): void {
  const normalizedKey = targetPublicKey.toLowerCase().trim();
  const channelTopic = `notifications:${normalizedKey}`;

  // Fire-and-forget — never blocks the API response
  broadcastSignal(channelTopic, {
    type: eventType,
    t: Date.now(),
  }).catch(() => {}); // Swallow any unhandled rejections
}
