/**
 * WebSocket Notification Hook
 * 
 * Connects to the server's WebSocket notification endpoint.
 * On receiving a "new_message" signal, immediately invalidates
 * the React Query message cache — making messages appear instantly
 * instead of waiting for the next poll cycle.
 * 
 * Security: NO message content flows through WebSocket.
 * It's a pure signal channel. All actual data is fetched via
 * authenticated HTTP requests through the existing pipeline.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface NotificationMessage {
  type: 'connected' | 'new_message' | 'friend_request' | 'friend_accepted';
  from?: string;
  t?: number;
}

export function useWebSocketNotifications(publicKey: string | null | undefined) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 10;

  useEffect(() => {
    if (!publicKey) return;

    function connect() {
      // Build WebSocket URL from current location
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/notifications?pk=${encodeURIComponent(publicKey!)}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.debug('[WS] Connected to notification server');
          reconnectAttempts.current = 0; // Reset on successful connection
        };

        ws.onmessage = (event) => {
          try {
            const data: NotificationMessage = JSON.parse(event.data);
            
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

              case 'connected':
                // Connection confirmed
                break;
            }
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onclose = (event) => {
          wsRef.current = null;
          
          // Don't reconnect if intentionally closed or max attempts reached
          if (event.code === 1000 || reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) return;

          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          
          console.debug(`[WS] Disconnected, reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        };

        ws.onerror = () => {
          // onclose will fire after this, handling reconnection
          ws.close();
        };

      } catch {
        // Failed to create WebSocket — fall back to polling (already active)
        console.debug('[WS] WebSocket not available, falling back to polling');
      }
    }

    connect();

    return () => {
      // Clean up on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
        wsRef.current = null;
      }
    };
  }, [publicKey, queryClient]);
}
