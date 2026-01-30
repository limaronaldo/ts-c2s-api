import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";

export const statsTools: Tool[] = [
  {
    name: "get_enrichment_stats",
    description:
      "Get comprehensive enrichment statistics including total leads, success rates, CPF discovery rates by tier, and trends over time.",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days to include in stats (default: 7)",
        },
        groupBy: {
          type: "string",
          enum: ["day", "seller", "source"],
          description: "Group statistics by dimension",
        },
      },
    },
  },
  {
    name: "get_service_health",
    description:
      "Check the health status of all services including Work API, C2S, CPF Lookup API, and database connectivity.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export async function handleStatsTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "get_enrichment_stats": {
      const { days = 7, groupBy } = args as {
        days?: number;
        groupBy?: "day" | "seller" | "source";
      };

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - days);

      const db = container.dbStorage.getDb();
      const { c2sLeads } = await import("../../db/schema");
      const { gte, sql, eq } = await import("drizzle-orm");

      // Get overall stats
      const overallStats = await db
        .select({
          total: sql<number>`count(*)`,
          completed: sql<number>`count(*) filter (where ${c2sLeads.enrichmentStatus} = 'completed')`,
          partial: sql<number>`count(*) filter (where ${c2sLeads.enrichmentStatus} = 'partial')`,
          pending: sql<number>`count(*) filter (where ${c2sLeads.enrichmentStatus} = 'pending')`,
          failed: sql<number>`count(*) filter (where ${c2sLeads.enrichmentStatus} = 'failed')`,
          withCpf: sql<number>`count(*) filter (where ${c2sLeads.cpf} is not null)`,
        })
        .from(c2sLeads)
        .where(gte(c2sLeads.receivedAt, dateFrom));

      const stats = overallStats[0];
      const total = Number(stats?.total || 0);
      const completed = Number(stats?.completed || 0);
      const partial = Number(stats?.partial || 0);
      const withCpf = Number(stats?.withCpf || 0);

      const result: Record<string, unknown> = {
        success: true,
        period: {
          days,
          from: dateFrom.toISOString(),
          to: new Date().toISOString(),
        },
        overview: {
          total,
          completed,
          partial,
          pending: Number(stats?.pending || 0),
          failed: Number(stats?.failed || 0),
          withCpf,
          enrichmentRate:
            total > 0 ? `${(((completed + partial) / total) * 100).toFixed(1)}%` : "0%",
          cpfDiscoveryRate:
            total > 0 ? `${((withCpf / total) * 100).toFixed(1)}%` : "0%",
        },
      };

      // Add grouped stats if requested
      if (groupBy === "day") {
        const dailyStats = await db
          .select({
            date: sql<string>`date(${c2sLeads.receivedAt})`,
            total: sql<number>`count(*)`,
            completed: sql<number>`count(*) filter (where ${c2sLeads.enrichmentStatus} = 'completed')`,
            withCpf: sql<number>`count(*) filter (where ${c2sLeads.cpf} is not null)`,
          })
          .from(c2sLeads)
          .where(gte(c2sLeads.receivedAt, dateFrom))
          .groupBy(sql`date(${c2sLeads.receivedAt})`)
          .orderBy(sql`date(${c2sLeads.receivedAt}) desc`);

        result.byDay = dailyStats.map((d) => ({
          date: d.date,
          total: Number(d.total),
          completed: Number(d.completed),
          cpfRate:
            Number(d.total) > 0
              ? `${((Number(d.withCpf) / Number(d.total)) * 100).toFixed(1)}%`
              : "0%",
        }));
      }

      if (groupBy === "seller") {
        const sellerStats = await db
          .select({
            sellerId: c2sLeads.sellerId,
            sellerName: c2sLeads.sellerName,
            total: sql<number>`count(*)`,
            completed: sql<number>`count(*) filter (where ${c2sLeads.enrichmentStatus} = 'completed')`,
            withCpf: sql<number>`count(*) filter (where ${c2sLeads.cpf} is not null)`,
          })
          .from(c2sLeads)
          .where(gte(c2sLeads.receivedAt, dateFrom))
          .groupBy(c2sLeads.sellerId, c2sLeads.sellerName)
          .orderBy(sql`count(*) desc`)
          .limit(20);

        result.bySeller = sellerStats.map((s) => ({
          sellerId: s.sellerId,
          sellerName: s.sellerName,
          total: Number(s.total),
          completed: Number(s.completed),
          cpfRate:
            Number(s.total) > 0
              ? `${((Number(s.withCpf) / Number(s.total)) * 100).toFixed(1)}%`
              : "0%",
        }));
      }

      if (groupBy === "source") {
        const sourceStats = await db
          .select({
            source: c2sLeads.leadSource,
            total: sql<number>`count(*)`,
            completed: sql<number>`count(*) filter (where ${c2sLeads.enrichmentStatus} = 'completed')`,
            withCpf: sql<number>`count(*) filter (where ${c2sLeads.cpf} is not null)`,
          })
          .from(c2sLeads)
          .where(gte(c2sLeads.receivedAt, dateFrom))
          .groupBy(c2sLeads.leadSource)
          .orderBy(sql`count(*) desc`);

        result.bySource = sourceStats.map((s) => ({
          source: s.source,
          total: Number(s.total),
          completed: Number(s.completed),
          cpfRate:
            Number(s.total) > 0
              ? `${((Number(s.withCpf) / Number(s.total)) * 100).toFixed(1)}%`
              : "0%",
        }));
      }

      return result;
    }

    case "get_service_health": {
      const healthChecks: Record<
        string,
        { status: string; latency?: number; error?: string }
      > = {};

      // Check database
      const dbStart = Date.now();
      try {
        const db = container.dbStorage.getDb();
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`SELECT 1`);
        healthChecks.database = {
          status: "healthy",
          latency: Date.now() - dbStart,
        };
      } catch (error) {
        healthChecks.database = {
          status: "unhealthy",
          error: error instanceof Error ? error.message : "Connection failed",
        };
      }

      // Check CPF Lookup API
      const cpfStart = Date.now();
      try {
        const health = await container.cpfLookup.healthCheck();
        healthChecks.cpfLookupApi = {
          status: health ? "healthy" : "unhealthy",
          latency: Date.now() - cpfStart,
        };
      } catch (error) {
        healthChecks.cpfLookupApi = {
          status: "unhealthy",
          latency: Date.now() - cpfStart,
          error: error instanceof Error ? error.message : "Health check failed",
        };
      }

      // Check C2S API (just verify config exists)
      try {
        const { getConfig } = await import("../../config");
        const config = getConfig();
        healthChecks.c2sApi = {
          status: config.C2S_TOKEN ? "configured" : "not_configured",
        };
      } catch {
        healthChecks.c2sApi = {
          status: "error",
          error: "Config check failed",
        };
      }

      // Check Work API (verify config)
      try {
        const { getConfig } = await import("../../config");
        const config = getConfig();
        healthChecks.workApi = {
          status: config.WORK_API ? "configured" : "not_configured",
        };
      } catch {
        healthChecks.workApi = {
          status: "error",
          error: "Config check failed",
        };
      }

      // Determine overall health
      const allHealthy = Object.values(healthChecks).every(
        (h) => h.status === "healthy" || h.status === "configured",
      );

      return {
        success: true,
        overall: allHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        services: healthChecks,
      };
    }

    default:
      throw new Error(`Unknown stats tool: ${name}`);
  }
}
