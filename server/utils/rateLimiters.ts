/**
 * Express rate limiters for strict API endpoint protection.
 * Restricts request frequency to defend against brute-force and denial-of-service attempts.
 */
import rateLimit from 'express-rate-limit';

export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 100,
  message: 'Too many attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 100,
  message: 'Message rate limit exceeded. Please wait a moment.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const globalRegistrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  keyGenerator: () => 'global_registration',
  message: 'Global registration rate limit exceeded. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
