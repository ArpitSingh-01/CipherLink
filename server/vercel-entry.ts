import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { registerRoutes } from "./routes";
import { requestSizeLimit } from "./middleware/sizeLimit";
import { perIPLimiter } from "./middleware/rateLimitPerIP";
import { createServer } from "http";

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

// Body parsing — express.json() with rawBody capture.
// On Vercel, req._body is set to true in the handler below so this is skipped.
// On local dev (if this entry is used), express.json() runs normally.
app.use(express.json({
  limit: '256kb',
  verify: (req: any, _res: any, buf: Buffer) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Register all API routes
const httpServer = createServer(app);

let initialized = false;
const initPromise = (async () => {
  await registerRoutes(httpServer, app);

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  initialized = true;
})();

// Export for Vercel
export default async function handler(req: any, res: any) {
  if (!initialized) await initPromise;

  // VERCEL BODY FIX: Vercel's runtime pre-parses the request body and
  // consumes the readable stream. express.json()'s verify callback never
  // fires, so req.rawBody is never set. The auth middleware then computes
  // SHA256('') instead of SHA256(actual_body) → signature mismatch → 401.
  //
  // Fix: Reconstruct rawBody from Vercel's pre-parsed req.body, then set
  // req._body = true so express.json() skips re-parsing the consumed stream.
  if (req.body !== undefined && req.body !== null) {
    const str = typeof req.body === 'object'
      ? JSON.stringify(req.body)
      : String(req.body);
    req.rawBody = Buffer.from(str, 'utf-8');
    if (typeof req.body === 'string') {
      try { req.body = JSON.parse(req.body); } catch { /* not JSON */ }
    }
    req._body = true; // skip express.json()
  }

  return app(req, res);
}
