import { db } from './db';
import { messages, friendCodes, prekeyBundles, deviceChallenges, authNonces, linkingRequests } from '@shared/schema';
import { lt, or, eq } from 'drizzle-orm';

import { config } from './config';
import { logError } from './utils/log';

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Cleans up expired data from the database:
 * Expired messages (where expires_at < now)
 * Expired or used friend codes
 * Expired prekey bundles
 * Expired or used device challenges
 * Expired auth nonces
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
      if (config.isDev) {
        process.stdout.write(
          `Cleanup completed in ${duration}ms: ` +
          `${deletedMessages.length} messages, ${deletedCodes.length} friend codes deleted\n`
        );
      }
    }

    return {
      deletedMessages: deletedMessages.length,
      deletedCodes: deletedCodes.length,
    };
  } catch (error) {
    logError('cleanupExpiredData', error);
    throw error;
  }
}


/**
 * Starts the cleanup job that runs every 60 seconds
 */
export function startCleanupJob(): void {
  if (cleanupInterval) {
    if (config.isDev) {
      process.stdout.write('Cleanup job already running\n');
    }
    return;
  }

  if (config.isDev) {
    process.stdout.write('Starting cleanup job (runs every 60 seconds)\n');
  }

  // Run immediately on startup - don't set interval if initial cleanup fails critically
  cleanupExpiredData().catch(err => {
    logError('initialCleanup', err);
  });

  // Then run every 60 seconds - wrap in try-catch to prevent interval crashes
  cleanupInterval = setInterval(() => {
    try {
      cleanupExpiredData().catch(err => {
        logError('scheduledCleanup', err);
      });
    } catch (err) {
      logError('cleanupInterval', err);
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
    if (config.isDev) {
      process.stdout.write('Cleanup job stopped\n');
    }
  }
}
