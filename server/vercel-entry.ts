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

// CORS configuration — wide-open in Vercel to avoid mismatch issues
const corsOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // In production, check against allowed list
    if (corsOrigins.some(allowed => origin.startsWith(allowed) || allowed === '*')) {
      return callback(null, true);
    }
    // Also allow any *.vercel.app origin for preview deployments
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    callback(null, false);
  },
  credentials: true,
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

app.use('/api/messages', requestSizeLimit(150 * 1024)); // 150KB for message endpoint only

// VERCEL FIX: Vercel's runtime pre-parses the request body and consumes the
// readable stream BEFORE Express can read it. This means express.json()'s
// `verify` callback never fires → req.rawBody is never set → the auth
// middleware computes SHA256('') instead of SHA256(actual_body) → every
// authenticated request fails with "Invalid signature".
//
// Solution: Insert middleware that reconstructs rawBody from Vercel's
// pre-parsed req.body, then use express.json() only as a fallback for
// cases where the body wasn't pre-parsed (e.g. local dev via this entry).
app.use((req: any, _res: any, next: any) => {
  // Vercel pre-parsed the body — reconstruct rawBody and parsed body
  if (req.body && typeof req.body === 'object' && !req.rawBody) {
    const bodyStr = JSON.stringify(req.body);
    req.rawBody = Buffer.from(bodyStr, 'utf-8');
    // Body is already parsed by Vercel — skip express.json()
    next();
  } else if (typeof req.body === 'string' && !req.rawBody) {
    // Vercel sometimes provides body as string
    req.rawBody = Buffer.from(req.body, 'utf-8');
    try { req.body = JSON.parse(req.body); } catch { /* leave as-is */ }
    next();
  } else {
    // Body not pre-parsed (fallback) — let express.json() handle it
    express.json({
      limit: '256kb',
      verify: (req: any, _res: any, buf: Buffer) => {
        req.rawBody = buf;
      },
    })(req, _res, next);
  }
});
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

// Export the Express app directly for Vercel
export default async function handler(req: any, res: any) {
  if (!initialized) await initPromise;
  return app(req, res);
}
