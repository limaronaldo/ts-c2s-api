/**
 * Rate Limiting Middleware
 *
 * Implements sliding window rate limiting for API endpoints.
 * Uses in-memory storage by default, can be extended to use Redis.
 *
 * Features:
 * - Configurable rate limits per endpoint
 * - Sliding window algorithm
 * - Returns standard rate limit headers
 * - Graceful handling of exceeded limits
 */

import { Elysia } from "elysia";
import { logger } from "../utils/logger";

const rateLimitLogger = logger.child({ module: "rate-limit" });

interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  max: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Key generator function (defaults to IP-based) */
  keyGenerator?: (request: Request) => string;
  /** Skip rate limiting for certain requests */
  skip?: (request: Request) => boolean;
  /** Message to return when rate limited */
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for rate limit tracking
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000); // Cleanup every minute

/**
 * Get client IP from request headers
 */
function getClientIp(request: Request): string {
  // Check common proxy headers
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fly.io specific
  const flyClientIp = request.headers.get("fly-client-ip");
  if (flyClientIp) {
    return flyClientIp;
  }

  return "unknown";
}

/**
 * Default key generator using IP address
 */
function defaultKeyGenerator(request: Request): string {
  const ip = getClientIp(request);
  const url = new URL(request.url);
  return `${ip}:${url.pathname}`;
}

/**
 * Check if request should be rate limited
 */
function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    const resetAt = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: max - 1, resetAt };
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt };
}

/**
 * Create rate limit middleware for Elysia
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    max,
    windowMs,
    keyGenerator = defaultKeyGenerator,
    skip,
    message = "Too many requests, please try again later",
  } = options;

  return new Elysia({ name: "rate-limit" }).onBeforeHandle(
    { as: "global" },
    ({ request, set }) => {
      // Skip if configured
      if (skip && skip(request)) {
        return;
      }

      const key = keyGenerator(request);
      const result = checkRateLimit(key, max, windowMs);

      // Set rate limit headers
      set.headers["X-RateLimit-Limit"] = String(max);
      set.headers["X-RateLimit-Remaining"] = String(result.remaining);
      set.headers["X-RateLimit-Reset"] = String(Math.ceil(result.resetAt / 1000));

      if (!result.allowed) {
        rateLimitLogger.warn(
          { key, max, windowMs },
          "Rate limit exceeded"
        );

        set.status = 429;
        set.headers["Retry-After"] = String(
          Math.ceil((result.resetAt - Date.now()) / 1000)
        );

        return {
          success: false,
          error: "rate_limit_exceeded",
          message,
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        };
      }
    }
  );
}

/**
 * Preset rate limiters for common use cases
 */

// Strict rate limit for sensitive endpoints (e.g., authentication)
export const strictRateLimit = rateLimit({
  max: 10,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: "Too many attempts, please try again in 15 minutes",
});

// Standard rate limit for API endpoints
export const standardRateLimit = rateLimit({
  max: 100,
  windowMs: 60 * 1000, // 1 minute
  message: "Rate limit exceeded, please slow down",
});

// Relaxed rate limit for read-only endpoints
export const relaxedRateLimit = rateLimit({
  max: 300,
  windowMs: 60 * 1000, // 1 minute
  message: "Rate limit exceeded",
});

// Webhook rate limit (higher limits for automated systems)
export const webhookRateLimit = rateLimit({
  max: 500,
  windowMs: 60 * 1000, // 1 minute
  skip: (request) => {
    // Skip rate limiting for health checks
    const url = new URL(request.url);
    return url.pathname === "/health";
  },
});
