/**
 * Dashboard Route (RML-639)
 *
 * Serves a monitoring dashboard for lead enrichment status.
 * - GET /dashboard - HTML dashboard page
 * - GET /dashboard/data - JSON data for AJAX refresh
 */

import { Elysia } from "elysia";
import { container } from "../container";
import { metricsService } from "../services/metrics.service";
import { alertService } from "../services/alert.service";
import { getCronStatus } from "../jobs/enrichment-cron";
import { generateDashboardHtml } from "../templates/dashboard.html";

export const dashboardRoute = new Elysia({ prefix: "/dashboard" })
  /**
   * GET /dashboard - Serve HTML dashboard
   */
  .get("/", async () => {
    const html = generateDashboardHtml();
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  })

  /**
   * GET /dashboard/data - JSON data for dashboard
   */
  .get("/data", async () => {
    try {
      // Get metrics snapshot
      const metrics = metricsService.getSnapshot();

      // Get lead status counts from database
      const stats = await container.dbStorage.getLeadStats();

      // Get recent leads
      const recentLeads = await container.dbStorage.getRecentLeads(20);

      // Get failed leads
      const failedLeads = await container.dbStorage.getFailedLeads(10);

      // Get cron status
      const cronStatus = getCronStatus();

      // Get service health
      const serviceHealth = alertService.getServiceHealth();

      // Get error rate stats
      const errorRate = alertService.getErrorRateStats();

      return {
        success: true,
        data: {
          metrics,
          stats,
          recentLeads,
          failedLeads,
          cronStatus,
          serviceHealth,
          errorRate,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
