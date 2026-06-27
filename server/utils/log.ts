/**
 * BUG-16 FIX: Shared error logging utility.
 * Replaces all `if (isDev) console.error(...)` patterns in supabase-storage.ts.
 * 
 * In dev: logs full error for debugging.
 * In prod: writes only the error message to stderr — never full stack traces.
 */

import { config } from '../config';

export function logError(context: string, error: unknown): void {
  if (config.isDev) {
    console.error(`[${context}]`, error);
  } else {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[ERROR] [${context}] ${msg}\n`);
  }
}
