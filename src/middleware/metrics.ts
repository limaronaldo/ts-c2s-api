import { Elysia } from "elysia";
import { container } from "../container";

/**
 * Middleware to collect HTTP request metrics
 * Records request count, duration, and status codes
 */
export const metricsMiddleware = new Elysia({ name: "metrics-middleware" })
  .derive(({ request }) => {
    return {
      metricsStartTime: Date.now(),
      metricsPath: new URL(request.url).pathname,
      metricsMethod: request.method,
    };
  })
  .onAfterResponse(
    ({ metricsStartTime, metricsPath, metricsMethod, set }) => {
      const durationSeconds = (Date.now() - metricsStartTime) / 1000;
      const status = set.status || 200;

      // Skip metrics endpoint itself to avoid recursion
      if (metricsPath === "/metrics") return;

      container.prometheus.recordHttpRequest(
        metricsMethod,
        metricsPath,
        typeof status === "number" ? status : 200,
        durationSeconds,
      );
    },
  );
