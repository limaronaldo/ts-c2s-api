/**
 * MCP Tools - Enrichment Monitor
 * RML-997: Enrichment rate monitoring and statistics
 *
 * Tools:
 * - get_enrichment_rate: Current enrichment rate with trend
 * - get_enrichment_health: Health status with threshold alerts
 * - get_enrichment_breakdown: Breakdown by status
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";
import { sql } from "drizzle-orm";

export const monitorTools: Tool[] = [
  {
    name: "get_enrichment_rate",
    description:
      "Get the current enrichment rate for the batch enrichment database. Returns total leads, enriched count, rate percentage, and health status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_enrichment_health",
    description:
      "Get enrichment health status. Checks if rate is above threshold (80%) and returns alert status. Use this to monitor enrichment pipeline health.",
    inputSchema: {
      type: "object",
      properties: {
        threshold: {
          type: "number",
          description: "Custom threshold percentage (default: 80)",
        },
      },
    },
  },
  {
    name: "get_enrichment_breakdown",
    description:
      "Get detailed breakdown of enrichment statuses. Shows count and percentage for each status (completed, partial, pending, failed, invalid_phone).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export async function handleMonitorTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "get_enrichment_rate": {
      try {
        const stats = await container.enrichmentMonitor.getCurrentStats();

        return {
          success: true,
          timestamp: new Date().toISOString(),
          stats: {
            total: stats.total,
            enriched: stats.enriched,
            unenriched: stats.unenriched,
            rate: stats.rate,
            rateFormatted: `${stats.rate}%`,
          },
          status: stats.rate >= 80 ? "healthy" : stats.rate >= 60 ? "warning" : "critical",
          message:
            stats.rate >= 80
              ? "Enrichment rate is healthy"
              : stats.rate >= 60
                ? "Enrichment rate below optimal threshold"
                : "Enrichment rate critically low - investigate",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to get stats",
        };
      }
    }

    case "get_enrichment_health": {
      const { threshold = 80 } = args as { threshold?: number };

      try {
        const stats = await container.enrichmentMonitor.getCurrentStats();

        const isHealthy = stats.rate >= threshold;
        const deficit = isHealthy ? 0 : Math.round((threshold - stats.rate) * stats.total / 100);

        return {
          success: true,
          timestamp: new Date().toISOString(),
          health: {
            status: isHealthy ? "healthy" : "unhealthy",
            currentRate: stats.rate,
            threshold,
            meetsThreshold: isHealthy,
            deficit: deficit,
            deficitMessage: deficit > 0
              ? `Need ${deficit} more enriched leads to reach ${threshold}% threshold`
              : null,
          },
          metrics: {
            total: stats.total,
            enriched: stats.enriched,
            unenriched: stats.unenriched,
          },
          recommendation: isHealthy
            ? "System is performing well. No action needed."
            : stats.rate >= 70
              ? "Rate slightly below threshold. Monitor and consider retry for failed leads."
              : stats.rate >= 50
                ? "Rate significantly below threshold. Investigate CPF discovery issues."
                : "Critical: Rate very low. Check Work API, CPF Lookup API, and other services.",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to check health",
        };
      }
    }

    case "get_enrichment_breakdown": {
      try {
        const db = container.dbStorage.getDb();

        const result = await db.execute(sql`
          SELECT
            enrichment_status,
            COUNT(*) as count
          FROM c2s.enriched_leads
          GROUP BY enrichment_status
          ORDER BY count DESC
        `);

        // Calculate totals
        const breakdown: Record<string, { count: number; percentage: number }> = {};
        let total = 0;

        const rows = Array.isArray(result) ? result : (result as any).rows || [];

        for (const row of rows) {
          const count = Number(row.count);
          total += count;
          breakdown[row.enrichment_status] = { count, percentage: 0 };
        }

        // Calculate percentages
        for (const status of Object.keys(breakdown)) {
          breakdown[status].percentage =
            total > 0
              ? Math.round((breakdown[status].count / total) * 1000) / 10
              : 0;
        }

        // Categorize
        const enrichedStatuses = ["completed", "partial"];
        const enrichedCount = enrichedStatuses.reduce(
          (sum, s) => sum + (breakdown[s]?.count || 0),
          0,
        );

        const enrichedRate =
          total > 0 ? Math.round((enrichedCount / total) * 1000) / 10 : 0;

        return {
          success: true,
          timestamp: new Date().toISOString(),
          total,
          summary: {
            enriched: enrichedCount,
            enrichedRate,
            unenriched: total - enrichedCount,
          },
          breakdown: Object.entries(breakdown).map(([status, data]) => ({
            status,
            count: data.count,
            percentage: data.percentage,
            percentageFormatted: `${data.percentage}%`,
          })),
          statusDescriptions: {
            completed: "Full enrichment with CPF and all data",
            partial: "CPF found but some data missing (e.g., Work API timeout)",
            pending: "Not yet processed",
            unenriched: "Processed but CPF not found",
            failed: "Processing error after max retries",
            invalid_phone: "Phone number invalid or not enrichable",
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to get breakdown",
        };
      }
    }

    default:
      throw new Error(`Unknown monitor tool: ${name}`);
  }
}
