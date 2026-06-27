/**
 * Supabase Realtime Client
 * 
 * Lightweight Supabase client configured for Realtime Broadcast only.
 * Used as a signal channel to push notifications to connected clients
 * without any message content — preserving E2E encryption.
 * 
 * Uses the anon key (public, safe for client-side).
 * The anon key is designed to be exposed — it only grants access
 * controlled by RLS policies. We use it purely for Realtime channels.
 */

import { createClient } from '@supabase/supabase-js';

// Use environment variables instead of hardcoded values.
// These are set in .env (local dev) or deployment environment (production).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const hasCredentials = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

if (!hasCredentials) {
  console.warn('[CipherLink] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env — realtime notifications disabled');
}

export const supabase = hasCredentials
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      // We only need Realtime — disable unused features to minimize overhead
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10, // Conservative — well within free tier (100/s)
        },
      },
    })
  : null;

export { SUPABASE_URL, SUPABASE_ANON_KEY };
