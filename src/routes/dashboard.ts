/**
 * Dashboard Route (RML-639)
 *
 * Serves a monitoring dashboard for lead enrichment status.
 * - GET /dashboard - HTML dashboard page
 * - GET /dashboard/data - JSON data for AJAX refresh
 * - GET /dashboard/retryable - List leads eligible for retry
 * - POST /dashboard/retry - Manually trigger retry processing
 * - GET /dashboard/export - Export leads as CSV
 */

import { Elysia, t } from "elysia";
import { container } from "../container";
import { metricsService } from "../services/metrics.service";
import { alertService } from "../services/alert.service";
import {
  getCronStatus,
  triggerManualRun,
  type CronJobConfig,
} from "../jobs/enrichment-cron";
import { generateDashboardHtml } from "../templates/dashboard.html";
import { getConfig } from "../config";
import { logger } from "../utils/logger";

const dashboardLogger = logger.child({ module: "dashboard" });

// Retry delays in milliseconds (must match enrichment-cron.ts)
const RETRY_DELAYS_MS = [
  1 * 60 * 60 * 1000, // 1 hour
  2 * 60 * 60 * 1000, // 2 hours
  4 * 60 * 60 * 1000, // 4 hours
  8 * 60 * 60 * 1000, // 8 hours
  16 * 60 * 60 * 1000, // 16 hours
];

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
  })

  /**
   * GET /dashboard/retryable - List leads eligible for retry
   */
  .get("/retryable", async () => {
    try {
      const config = getConfig();
      const retryableLeads = await container.dbStorage.getRetryableLeads(
        config.RETRY_MAX_ATTEMPTS,
        RETRY_DELAYS_MS,
      );

      return {
        success: true,
        data: {
          count: retryableLeads.length,
          maxRetries: config.RETRY_MAX_ATTEMPTS,
          retryEnabled: config.RETRY_ENABLED,
          leads: retryableLeads.map((lead) => ({
            id: lead.id,
            leadId: lead.leadId,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            status: lead.enrichmentStatus,
            retryCount: lead.retryCount ?? 0,
            lastRetryAt: lead.lastRetryAt,
            lastError: lead.lastError,
            createdAt: lead.createdAt,
            nextRetryDelay:
              RETRY_DELAYS_MS[
                Math.min(lead.retryCount ?? 0, RETRY_DELAYS_MS.length - 1)
              ] /
                60000 +
              " min",
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })

  /**
   * POST /dashboard/retry - Manually trigger retry processing
   */
  .post("/retry", async () => {
    try {
      const config = getConfig();

      if (!config.RETRY_ENABLED) {
        return {
          success: false,
          error: "Retry is disabled in configuration",
        };
      }

      dashboardLogger.info("Manual retry triggered from dashboard");

      const cronConfig: CronJobConfig = {
        enabled: true,
        interval: config.CRON_INTERVAL,
        batchSize: config.CRON_BATCH_SIZE,
        delayMs: config.CRON_DELAY_MS,
      };

      // Run in background to avoid timeout
      triggerManualRun(cronConfig).catch((err) => {
        dashboardLogger.error({ error: err }, "Manual retry run failed");
      });

      return {
        success: true,
        message: "Retry processing started in background",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })

  /**
   * GET /dashboard/export - Export leads as CSV
   */
  .get(
    "/export",
    async ({ query }) => {
      try {
        const { status, limit = 1000, format = "csv" } = query;

        let leads;
        if (status === "failed") {
          leads = await container.dbStorage.getFailedLeads(limit);
        } else if (status) {
          leads = await container.dbStorage.getLeadsByStatus([status]);
        } else {
          leads = await container.dbStorage.getRecentLeads(limit);
        }

        if (format === "json") {
          return {
            success: true,
            data: leads,
            count: leads.length,
          };
        }

        // CSV format
        const headers = [
          "id",
          "lead_id",
          "name",
          "phone",
          "email",
          "status",
          "retry_count",
          "last_retry_at",
          "last_error",
          "created_at",
        ];

        const rows = leads.map((lead) => [
          lead.id,
          lead.leadId,
          lead.name ?? "",
          lead.phone ?? "",
          lead.email ?? "",
          lead.enrichmentStatus ?? "",
          lead.retryCount ?? 0,
          lead.lastRetryAt?.toISOString() ?? "",
          (lead.lastError ?? "").replace(/"/g, '""'),
          lead.createdAt.toISOString(),
        ]);

        const csv = [
          headers.join(","),
          ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
        ].join("\n");

        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="leads-${status || "all"}-${new Date().toISOString().split("T")[0]}.csv"`,
          },
        });
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        format: t.Optional(t.Union([t.Literal("csv"), t.Literal("json")])),
      }),
    },
  );
