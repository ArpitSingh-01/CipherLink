import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { registerRoutes } from "./routes/index";
import { serveStatic } from "./static";
import { config } from "./config";
import { createServer } from "http";
import { startCleanupJob, stopCleanupJob } from "./cleanup";
import { closeDatabase } from "./db";
import { requestSizeLimit } from "./middleware/sizeLimit";
import { perIPLimiter } from "./middleware/rateLimitPerIP";
// WebSocket server (ws.ts) is available but NOT imported/started.
// See comment below at the former setupWebSocket() call site.

const app = express();
const httpServer = createServer(app);

// SEC-08: Enable trust proxy so express-rate-limit gets real client IP
// when deployed behind Nginx/Cloudflare/etc.
app.set('trust proxy', 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// CORS configuration - strictly restrict origins in production
app.use(cors({
  origin: config.isProd
    ? (origin, callback) => {
      // SEC-16: Remove !origin bypass — no credentialed requests from server-side/no-origin callers
      if (origin && config.cors.origins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
    : true,
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Public-Key', 'X-Timestamp', 'X-Signature', 'X-Device-Key', 'X-Request-Nonce', 'X-Link-Signature'],
}));



// SEC-FIX: Apply per-IP rate limiting globally (before other middleware)
app.use(perIPLimiter);

// SEC-FIX: Apply request size limit BEFORE authentication to prevent DoS
// This rejects large requests early, before expensive signature verification
app.use('/api/messages', requestSizeLimit(150 * 1024)); // 150KB max for messages

// Security headers - relaxed in development for Vite HMR
app.use(helmet({
  contentSecurityPolicy: config.isDev
    ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        connectSrc: ["'self'", "ws:", "wss:", "https://*.supabase.co", "wss://*.supabase.co"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
      },
    }
    : {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        connectSrc: ["'self'", "wss:", "https://*.vercel.app", "https://*.supabase.co", "wss://*.supabase.co"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
      },
    },
  hsts: !config.isDev
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.isProd ? 100 : 1000,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// Body parsing with size limits
app.use(
  express.json({
    limit: '1mb', // Limit request body size
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '1mb' }));

import { log } from './log';
export { log };

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // SEC-10: Only log method, path, status, duration — never response bodies
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Notifications: server pushes via Supabase Realtime (broadcast.ts).
  // WebSocket server (ws.ts) is available but not started — Vercel serverless
  // does not support persistent WS connections. Use broadcast.ts for all envs.
  // The Supabase Realtime channel uses the public key as the channel name.
  // No message content flows through it — only cache-invalidation signals.

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    // SEC-HARDEN: Do not re-throw — would crash the process
    // Wrap console.error to prevent crashes if logging fails
    try {
      if (config.isDev) {
        console.error('Unhandled error:', err);
      }
    } catch {
      // Ignore logging errors to prevent crash
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (config.isProd) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // FIX 3: Only run setInterval in non-Vercel environments (local dev / traditional VPS)
  // On Vercel, cleanup is handled by the /api/internal/cleanup cron endpoint
  if (!config.isVercel) {
    startCleanupJob();
  }

  // ALWAYS serve the app on the port specified in config.port
  httpServer.listen(config.port, "0.0.0.0", () => {
    log(`serving on port ${config.port}`);
  });

  // Graceful shutdown handling
  const shutdown = async () => {
    log('Shutting down gracefully...');
    stopCleanupJob();
    await closeDatabase();
    httpServer.close(() => {
      log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
})();
