import type { Express } from 'express';
import type { Server } from 'http';
import { registerUserRoutes } from './users';
import { registerDeviceRoutes } from './devices';
import { registerLinkingRoutes } from './linking';
import { registerFriendRoutes } from './friends';
import { registerMessageRoutes } from './messages';
import { registerBlocklistRoutes } from './blocklist';
import { registerPrekeyRoutes } from './prekeys';
import { registerInternalRoutes } from './internal';

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  registerInternalRoutes(app);
  registerUserRoutes(app);
  registerDeviceRoutes(app);
  registerLinkingRoutes(app);
  registerFriendRoutes(app);
  registerMessageRoutes(app);
  registerBlocklistRoutes(app);
  registerPrekeyRoutes(app);

  // Catch-all for unmatched API routes
  app.all('/api/*', (_req, res) => res.status(404).json({ error: 'API route not found' }));

  return httpServer;
}
