/**
 * Internal routes — Vercal cleanup cron and minimal public health checks.
 */
import type { Express } from 'express';
import { db } from "../db";
import { messages, authNonces } from "@shared/schema";
import { lt } from "drizzle-orm";
import { cleanupExpiredData } from "../cleanup";
import { logError } from '../utils/log';

export function registerInternalRoutes(app: Express): void {
  // ── Cleanup Cron ──────────────────────────────────────────────────────────────

  app.get('/api/internal/cleanup', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (process.env.NODE_ENV === 'production') {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    try {
      const result = await cleanupExpiredData();

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await db.delete(messages).where(lt(messages.createdAt, twentyFourHoursAgo)).catch(() => {});
      await db.delete(authNonces).where(lt(authNonces.expiresAt, new Date())).catch(() => {});

      res.json({
        success: true,
        deletedMessages: result.deletedMessages,
        deletedCodes: result.deletedCodes,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logError('cleanupCron', error);
      res.status(500).json({ error: 'Cleanup failed' });
    }
  });

  // ── Health Check ──────────────────────────────────────────────────────────────

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
}
