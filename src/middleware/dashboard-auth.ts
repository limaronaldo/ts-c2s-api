/**
 * Dashboard Basic Auth Middleware (RML-811)
 *
 * Protects /dashboard routes with HTTP Basic Authentication.
 * Credentials are configured via environment variables:
 * - DASHBOARD_USER (default: admin)
 * - DASHBOARD_PASSWORD (required for auth to be enabled)
 */

import { Elysia } from "elysia";
import { logger } from "../utils/logger";

const authLogger = logger.child({ module: "dashboard-auth" });

interface DashboardAuthConfig {
  user: string;
  password: string;
  realm?: string;
}

/**
 * Get dashboard auth config from environment
 */
export function getDashboardAuthConfig(): DashboardAuthConfig | null {
  const user = process.env.DASHBOARD_USER || "admin";
  const password = process.env.DASHBOARD_PASSWORD;

  if (!password) {
    return null; // Auth disabled if no password set
  }

  return {
    user,
    password,
    realm: "MBRAS Dashboard",
  };
}

/**
 * Verify Basic Auth credentials
 */
function verifyBasicAuth(
  authHeader: string | null,
  config: DashboardAuthConfig,
): boolean {
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  try {
    const base64Credentials = authHeader.slice(6); // Remove "Basic "
    const credentials = Buffer.from(base64Credentials, "base64").toString(
      "utf-8",
    );
    const [user, password] = credentials.split(":");

    return user === config.user && password === config.password;
  } catch {
    return false;
  }
}

/**
 * Create 401 Unauthorized response with WWW-Authenticate header
 */
function createUnauthorizedResponse(realm: string): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${realm}"`,
      "Content-Type": "text/plain",
    },
  });
}

/**
 * Dashboard Basic Auth middleware
 *
 * Usage:
 * ```typescript
 * app.use(dashboardAuth())
 * ```
 *
 * If DASHBOARD_PASSWORD is not set, auth is disabled (open access).
 */
export const dashboardAuth = () => {
  const config = getDashboardAuthConfig();

  if (!config) {
    authLogger.warn("Dashboard auth disabled - DASHBOARD_PASSWORD not set");
    return new Elysia({ name: "dashboard-auth-disabled" });
  }

  authLogger.info({ user: config.user }, "Dashboard Basic Auth enabled");

  return new Elysia({ name: "dashboard-auth" }).onBeforeHandle(
    ({ request }) => {
      // Get the pathname from the full URL
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Only protect /dashboard routes
      if (!pathname.startsWith("/dashboard")) {
        return; // Continue to next handler
      }

      const authHeader = request.headers.get("Authorization");

      if (!verifyBasicAuth(authHeader, config)) {
        authLogger.debug(
          { pathname, hasAuth: !!authHeader },
          "Dashboard auth failed",
        );
        return createUnauthorizedResponse(config.realm || "Dashboard");
      }

      authLogger.debug({ pathname }, "Dashboard auth successful");
    },
  );
};

/**
 * Check if dashboard auth is enabled
 */
export function isDashboardAuthEnabled(): boolean {
  return getDashboardAuthConfig() !== null;
}
