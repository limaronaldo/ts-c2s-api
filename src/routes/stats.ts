/**
 * Stats Route - Enrichment statistics endpoint
 *
 * Provides real-time statistics about enrichment rates and lead processing.
 */

import { Elysia } from "elysia";
import { enrichmentMonitor } from "../services/enrichment-monitor.service";
import { alertService } from "../services/alert.service";

export const statsRoute = new Elysia({ prefix: "/stats" })
  /**
   * GET /stats
   * Get comprehensive enrichment statistics
   */
  .get("/", async () => {
    const enrichmentStats = await enrichmentMonitor.getCurrentStats();
    const errorStats = alertService.getErrorRateStats();
    const serviceHealth = alertService.getServiceHealth();

    return {
      success: true,
      data: {
        enrichment: {
          total: enrichmentStats.total,
          enriched: enrichmentStats.enriched,
          unenriched: enrichmentStats.unenriched,
          rate: enrichmentStats.rate,
          rateFormatted: `${enrichmentStats.rate}%`,
          threshold: 80,
          status: enrichmentStats.rate >= 80 ? "healthy" : "warning",
        },
        recentActivity: {
          errorRate: errorStats.errorRate,
          totalAttempts: errorStats.totalAttempts,
          failures: errorStats.failures,
          successes: errorStats.successes,
        },
        services: serviceHealth,
        timestamp: new Date().toISOString(),
      },
    };
  })

  /**
   * GET /stats/enrichment
   * Get only enrichment statistics
   */
  .get("/enrichment", async () => {
    const stats = await enrichmentMonitor.getCurrentStats();

    return {
      success: true,
      data: {
        ...stats,
        rateFormatted: `${stats.rate}%`,
        threshold: 80,
        status: stats.rate >= 80 ? "healthy" : "warning",
      },
    };
  })

  /**
   * GET /stats/health
   * Get service health status
   */
  .get("/health", () => {
    const errorStats = alertService.getErrorRateStats();
    const serviceHealth = alertService.getServiceHealth();

    return {
      success: true,
      data: {
        errorRate: errorStats.errorRate,
        services: serviceHealth,
        timestamp: new Date().toISOString(),
      },
    };
  });
