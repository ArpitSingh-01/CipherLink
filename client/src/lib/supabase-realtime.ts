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

// These values are public and safe to embed in client code.
// The anon key is a publishable key with no privileged access.
const SUPABASE_URL = 'https://zhkdhkefmvaitkvbqedx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpoa2Roa2VmbXZhaXRrdmJxZWR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMzk5MzcsImV4cCI6MjA3OTkxNTkzN30.LmvU3Pfvj3MjPLdyL1BBLNAYv10jsNKPSEOJ36I49hg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
});

export { SUPABASE_URL, SUPABASE_ANON_KEY };
