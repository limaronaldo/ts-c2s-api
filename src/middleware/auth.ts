/**
 * Authentication Middleware
 *
 * Provides API key authentication for protected endpoints.
 *
 * Features:
 * - API key validation via header or query param
 * - Multiple API keys support
 * - Configurable header name
 * - Skip authentication for certain paths
 */

import { Elysia } from "elysia";
import { logger } from "../utils/logger";

const authLogger = logger.child({ module: "auth" });

interface AuthOptions {
  /** Valid API keys */
  apiKeys: string[];
  /** Header name for API key (default: x-api-key) */
  headerName?: string;
  /** Query parameter name for API key (default: api_key) */
  queryParamName?: string;
  /** Paths to skip authentication */
  skipPaths?: string[];
  /** Custom error message */
  message?: string;
}

/**
 * Extract API key from request
 */
function extractApiKey(
  request: Request,
  headerName: string,
  queryParamName: string
): string | null {
  // Check header first
  const headerKey = request.headers.get(headerName);
  if (headerKey) {
    return headerKey;
  }

  // Check query parameter
  const url = new URL(request.url);
  const queryKey = url.searchParams.get(queryParamName);
  if (queryKey) {
    return queryKey;
  }

  // Check Authorization header (Bearer token)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Validate API key against list of valid keys
 */
function validateApiKey(key: string, validKeys: string[]): boolean {
  for (const validKey of validKeys) {
    if (secureCompare(key, validKey)) {
      return true;
    }
  }
  return false;
}

/**
 * Create authentication middleware for Elysia
 */
export function apiKeyAuth(options: AuthOptions) {
  const {
    apiKeys,
    headerName = "x-api-key",
    queryParamName = "api_key",
    skipPaths = ["/health", "/dashboard", "/dashboard/data"],
    message = "Invalid or missing API key",
  } = options;

  if (apiKeys.length === 0) {
    authLogger.warn("No API keys configured, authentication is disabled");
  }

  return new Elysia({ name: "api-key-auth" }).onBeforeHandle(
    { as: "global" },
    ({ request, set }) => {
      const url = new URL(request.url);

      // Skip authentication for certain paths
      if (skipPaths.some((path) => url.pathname.startsWith(path))) {
        return;
      }

      // Skip if no API keys configured (development mode)
      if (apiKeys.length === 0) {
        return;
      }

      const providedKey = extractApiKey(request, headerName, queryParamName);

      if (!providedKey) {
        authLogger.debug({ path: url.pathname }, "Missing API key");
        set.status = 401;
        return {
          success: false,
          error: "unauthorized",
          message: "API key is required",
        };
      }

      if (!validateApiKey(providedKey, apiKeys)) {
        authLogger.warn(
          { path: url.pathname, keyPrefix: providedKey.slice(0, 8) + "..." },
          "Invalid API key"
        );
        set.status = 401;
        return {
          success: false,
          error: "unauthorized",
          message,
        };
      }

      // Valid API key - continue
      authLogger.debug({ path: url.pathname }, "API key validated");
    }
  );
}

/**
 * Webhook signature validation
 */
export function webhookAuth(secret: string | undefined) {
  return new Elysia({ name: "webhook-auth" }).onBeforeHandle(
    { as: "global" },
    async ({ request, set }) => {
      // Skip if no secret configured
      if (!secret) {
        return;
      }

      const signature = request.headers.get("x-webhook-signature");

      if (!signature) {
        authLogger.debug("Missing webhook signature");
        set.status = 401;
        return {
          success: false,
          error: "unauthorized",
          message: "Webhook signature is required",
        };
      }

      // For simple shared secret validation
      if (!secureCompare(signature, secret)) {
        authLogger.warn("Invalid webhook signature");
        set.status = 401;
        return {
          success: false,
          error: "unauthorized",
          message: "Invalid webhook signature",
        };
      }
    }
  );
}

/**
 * Create API key from environment
 */
export function getApiKeysFromEnv(): string[] {
  const keys: string[] = [];

  // Support multiple API keys via comma-separated list
  const apiKeyEnv = process.env.API_KEYS;
  if (apiKeyEnv) {
    keys.push(...apiKeyEnv.split(",").map((k) => k.trim()).filter(Boolean));
  }

  // Support single API key
  const singleKey = process.env.API_KEY;
  if (singleKey && !keys.includes(singleKey)) {
    keys.push(singleKey);
  }

  return keys;
}
