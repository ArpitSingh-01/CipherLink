import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { registerRoutes } from "./routes";
import { requestSizeLimit } from "./middleware/sizeLimit";
import { perIPLimiter } from "./middleware/rateLimitPerIP";
import { cleanupExpiredData } from "./cleanup";

const app = express();

// SEC-08: Enable trust proxy for Vercel
app.set('trust proxy', 1);

// CORS configuration
const corsOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOrigins.some(allowed => origin.startsWith(allowed) || allowed === '*')) {
      return callback(null, true);
    }
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Public-Key', 'X-Timestamp', 'X-Signature', 'X-Device-Key', 'X-Request-Nonce'],
}));

// Security headers (relaxed CSP for Vercel)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});
app.use(globalLimiter);
app.use(perIPLimiter);

app.use('/api/messages', requestSizeLimit(150 * 1024));

// Body parsing with rawBody capture for auth signature verification.
// Primary path: express.json()'s verify callback captures raw bytes from the stream.
// This works when the stream is intact (local dev, or if Vercel respects bodyParser:false).
app.use(express.json({
  limit: '256kb',
  verify: (req: any, _res: any, buf: Buffer) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Fallback path: If Vercel's runtime consumed the stream before Express could read it,
// the verify callback never fires and rawBody is undefined. In that case, reconstruct
// rawBody from the parsed body. JSON.stringify(JSON.parse(x)) === x for objects
// serialized with default JSON.stringify (no whitespace, no custom toJSON).
app.use((req: any, _res: any, next: any) => {
  if (!req.rawBody && req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    req.rawBody = Buffer.from(JSON.stringify(req.body), 'utf-8');
  }
  next();
});

// Register all API routes — no HTTP server needed in serverless (Vercel provides req/res)
let initialized = false;
const initPromise = (async () => {
  await registerRoutes(null as any, app);

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  initialized = true;
})();

// Disable Vercel's built-in body parser so the request stream remains
// intact for Express to read. Without this, Vercel consumes the stream
// before express.json()'s verify callback can capture rawBody, causing
// all authenticated requests to fail with "Invalid signature".
export const config = {
  api: {
    bodyParser: false,
  },
  memory: 256,
  maxDuration: 10,
};

// Export handler for Vercel
export default async function handler(req: any, res: any) {
  if (!initialized) await initPromise;

  // Vercel's rewrite rule "/api/:path*" → "/api" captures the sub-path and
  // appends it as a `?path=` query parameter (e.g. "/api/users?path=users").
  // This extra parameter ends up in req.originalUrl, which the auth middleware
  // uses to compute the signed message. Since the client signs the URL without
  // this Vercel-injected parameter, the signatures never match.
  // Fix: strip the `path` parameter from the URL before Express processes it.
  if (req.url) {
    const url = new URL(req.url, 'http://localhost');
    url.searchParams.delete('path');
    req.url = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '');
  }

  // Probabilistic cleanup: ~1% of requests trigger expired-data cleanup.
  // Vercel Hobby plan doesn't support crons, so this prevents unbounded
  // growth of auth_nonces, expired messages, friend codes, etc.
  // Fire-and-forget — never blocks the response.
  if (Math.random() < 0.01) {
    cleanupExpiredData().catch(() => {});
  }

  return app(req, res);
}

