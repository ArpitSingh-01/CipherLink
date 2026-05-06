/**
 * Supabase Realtime Notification Hook
 * 
 * Replaces the previous WebSocket notification hook with Supabase Realtime
 * Broadcast. Works everywhere — Vercel serverless, local dev, any host.
 * 
 * Architecture:
 * - Client subscribes to a per-user broadcast channel: `notifications:{publicKey}`
 * - Server POSTs a broadcast signal via Supabase REST API after storing a message
 * - Client receives the signal and invalidates React Query cache
 * - Client then fetches fresh data via authenticated HTTP (Ed25519 signed)
 * 
 * Security: NO message content flows through Supabase Realtime.
 * It's a pure signal channel. All actual data is fetched via
 * authenticated HTTP requests through the existing pipeline.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-realtime';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface NotificationPayload {
  type: 'new_message' | 'friend_request' | 'friend_accepted';
  from?: string;
  t?: number;
}

export function useWebSocketNotifications(publicKey: string | null | undefined) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!publicKey) return;

    // Create a unique channel name for this user
    const channelName = `notifications:${publicKey.toLowerCase()}`;

    // Subscribe to Supabase Realtime Broadcast channel
    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'signal' }, (payload) => {
        const data = payload.payload as NotificationPayload;

        switch (data.type) {
          case 'new_message':
            // Instantly invalidate message cache — triggers re-fetch
            queryClient.invalidateQueries({
              queryKey: ['/api/messages'],
              exact: false,
            });
            break;

          case 'friend_request':
          case 'friend_accepted':
            // Invalidate friend-related caches
            queryClient.invalidateQueries({
              queryKey: ['/api/friend-requests'],
              exact: false,
            });
            queryClient.invalidateQueries({
              queryKey: ['/api/friends'],
              exact: false,
            });
            break;
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.debug('[Realtime] Connected to notification channel');
        } else if (status === 'CHANNEL_ERROR') {
          console.debug('[Realtime] Channel error — polling fallback active');
        }
      });

    channelRef.current = channel;

    return () => {
      // Clean up on unmount
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [publicKey, queryClient]);
}
