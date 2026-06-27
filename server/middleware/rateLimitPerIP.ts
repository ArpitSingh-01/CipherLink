import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * SEC-FIX: Per-IP rate limiting
 * 
 * Prevents DoS attacks by limiting requests per IP address.
 * Applied globally to all routes.
 */
export const perIPLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.isProd ? 60 : 300, // 60 requests per minute in prod
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limit for localhost in development
  skip: (req) => {
    return config.isDev && 
           (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1');
  },
});
