import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { registerRoutes } from "../server/routes";
import { requestSizeLimit } from "../server/middleware/sizeLimit";
import { perIPLimiter } from "../server/middleware/rateLimitPerIP";
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

// Body parsing with size limit
app.use(requestSizeLimit);
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

// Export the Express app directly for Vercel
export default async function handler(req: any, res: any) {
  if (!initialized) await initPromise;
  return app(req, res);
}
