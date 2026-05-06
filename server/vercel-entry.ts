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

// Body parsing with rawBody capture for auth signature verification.
// Vercel's built-in body parser is disabled via the `config` export below,
// so the request stream is intact and express.json() reads it normally.
// The `verify` callback captures the exact raw bytes for signature hashing.
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

// Disable Vercel's built-in body parser so the request stream remains
// intact for Express to read. Without this, Vercel consumes the stream
// before express.json()'s verify callback can capture rawBody, causing
// all authenticated requests to fail with "Invalid signature".
export const config = {
  api: {
    bodyParser: false,
  },
};

// Export handler for Vercel
export default async function handler(req: any, res: any) {
  if (!initialized) await initPromise;
  return app(req, res);
}

