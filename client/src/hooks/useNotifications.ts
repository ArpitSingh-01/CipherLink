/**
 * Real-time notification hook using Supabase Realtime Broadcast.
 *
 * NOT a WebSocket connection — uses the Supabase client, which manages
 * its own WebSocket connection internally.
 *
 * Architecture:
 *   Server POSTs to Supabase Realtime REST API after each stored event
 *   Supabase pushes the signal to this subscriber
 *   Hook invalidates React Query cache → components refetch via signed HTTP
 *
 * Security: NO message content flows through this channel.
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

export function useNotifications(publicKey: string | null | undefined, onTypingReceived?: (from: string) => void) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabase || !publicKey) return;

    // Create a unique channel name for this user
    const channelName = `notifications:${publicKey.toLowerCase()}`;

    // Subscribe to Supabase Realtime Broadcast channel
    const channel = supabase
      .channel(channelName, {
        config: {
          private: true,
        },
      })
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

          case 'typing' as any:
            if (onTypingReceived && (data as any).from) {
              onTypingReceived((data as any).from);
            }
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
        if (import.meta.env.DEV) {
          if (status === 'SUBSCRIBED') {
            console.debug('[Realtime] Connected to notification channel');
          } else if (status === 'CHANNEL_ERROR') {
            console.debug('[Realtime] Channel error — polling fallback active');
          }
        }
      });

    channelRef.current = channel;

    return () => {
      // Clean up on unmount
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [publicKey, queryClient]);
}
