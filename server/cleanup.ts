import { db } from './db';
import { messages, friendCodes, prekeyBundles, deviceChallenges, authNonces, linkingRequests } from '@shared/schema';
import { lt, or, eq } from 'drizzle-orm';

const isDev = process.env.NODE_ENV !== 'production';
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Cleans up expired data from the database:
 * - Expired messages (where expires_at < now)
 * - Expired or used friend codes
 * - Expired prekey bundles
 * - Expired or used device challenges
 * - Expired auth nonces
 */
export async function cleanupExpiredData(): Promise<{ deletedMessages: number; deletedCodes: number }> {
  const startTime = Date.now();
  const now = new Date();

  try {
    // Delete expired messages
    const deletedMessages = await db.delete(messages)
      .where(lt(messages.expiresAt, now))
      .returning({ id: messages.id });

    // Delete expired or used friend codes
    const deletedCodes = await db.delete(friendCodes)
      .where(
        or(
          lt(friendCodes.expiresAt, now),
          eq(friendCodes.used, true)
        )
      )
      .returning({ id: friendCodes.id });

    // Delete expired prekey bundles (best-effort)
    await db.delete(prekeyBundles)
      .where(lt(prekeyBundles.expiresAt, now))
      .catch(() => {});

    // Delete expired or used device challenges (best-effort)
    await db.delete(deviceChallenges)
      .where(
        or(lt(deviceChallenges.expiresAt, now), eq(deviceChallenges.used, true))
      )
      .catch(() => {});

    // Delete expired auth nonces (best-effort)
    await db.delete(authNonces)
      .where(lt(authNonces.expiresAt, now))
      .catch(() => {});

    // Delete expired linking requests or rejected ones
    await db.delete(linkingRequests)
      .where(
        or(
          lt(linkingRequests.expiresAt, now),
          eq(linkingRequests.status, 'rejected')
        )
      )
      .catch(() => {});

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (deletedMessages.length > 0 || deletedCodes.length > 0) {
      if (isDev) {
        console.log(
          `Cleanup completed in ${duration}ms: ` +
          `${deletedMessages.length} messages, ${deletedCodes.length} friend codes deleted`
        );
      }
    }

    return {
      deletedMessages: deletedMessages.length,
      deletedCodes: deletedCodes.length,
    };
  } catch (error) {
    if (isDev) console.error('Cleanup job failed:', error);
    throw error;
  }
}


/**
 * Starts the cleanup job that runs every 60 seconds
 */
export function startCleanupJob(): void {
  if (cleanupInterval) {
    if (isDev) console.warn('Cleanup job already running');
    return;
  }

  if (isDev) console.log('Starting cleanup job (runs every 60 seconds)');

  // Run immediately on startup - don't set interval if initial cleanup fails critically
  cleanupExpiredData().catch(err => {
    if (isDev) {
      try {
        console.error('Initial cleanup failed:', err);
      } catch {
        // Ignore logging errors
      }
    }
  });

  // Then run every 60 seconds - wrap in try-catch to prevent interval crashes
  cleanupInterval = setInterval(() => {
    try {
      cleanupExpiredData().catch(err => {
        if (isDev) {
          try {
            console.error('Scheduled cleanup failed:', err);
          } catch {
            // Ignore logging errors
          }
        }
      });
    } catch (err) {
      // Catch synchronous errors to prevent interval from stopping
      if (isDev) {
        try {
          console.error('Cleanup interval error:', err);
        } catch {
          // Ignore logging errors
        }
      }
    }
  }, 60000);
}

/**
 * Stops the cleanup job gracefully
 */
export function stopCleanupJob(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    if (isDev) console.log('Cleanup job stopped');
  }
}
