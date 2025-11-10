import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

// Create rate limiter middleware
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS, // 15 minutes
  max: env.RATE_LIMIT_MAX_REQUESTS, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Stricter rate limiter for write operations
export const writeApiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: Math.floor(env.RATE_LIMIT_MAX_REQUESTS / 2), // 50 requests
  message: {
    error: 'Too many write requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
