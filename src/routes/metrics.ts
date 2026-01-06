import { Elysia } from "elysia";
import { container } from "../container";

/**
 * Prometheus metrics endpoint
 * Exposes metrics in Prometheus format for scraping
 */
export const metricsRoute = new Elysia().get("/metrics", async ({ set }) => {
  const prometheus = container.prometheus;

  // Update lead status gauges from database
  try {
    const stats = await container.dbStorage.getLeadStats();
    prometheus.updateLeadStatusGauges(stats);
  } catch {
    // If DB is unavailable, continue with cached metrics
  }

  // Set content type for Prometheus
  set.headers["content-type"] = prometheus.getContentType();

  return prometheus.getMetrics();
});
