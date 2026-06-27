/**
 * BUG-16 FIX: Shared error logging utility.
 * Replaces all `if (isDev) console.error(...)` patterns in supabase-storage.ts.
 * 
 * In dev: logs full error for debugging.
 * In prod: writes only the error message to stderr — never full stack traces.
 */

const isDev = process.env.NODE_ENV !== 'production';

export function logError(context: string, error: unknown): void {
  if (isDev) {
    console.error(`[${context}]`, error);
  } else {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[ERROR] [${context}] ${msg}\n`);
  }
}
