import type { ServiceContainer } from "../../container";

export async function getStatsResource(
  container: ServiceContainer,
): Promise<unknown> {
  const db = container.dbStorage.getDb();
  const { c2sLeads } = await import("../../db/schema");
  const { sql, gte } = await import("drizzle-orm");

  // Last 7 days
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 7);

  const stats = await db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`count(*) filter (where ${c2sLeads.enrichmentStatus} = 'completed')`,
      partial: sql<number>`count(*) filter (where ${c2sLeads.enrichmentStatus} = 'partial')`,
      pending: sql<number>`count(*) filter (where ${c2sLeads.enrichmentStatus} = 'pending')`,
      processing: sql<number>`count(*) filter (where ${c2sLeads.enrichmentStatus} = 'processing')`,
      failed: sql<number>`count(*) filter (where ${c2sLeads.enrichmentStatus} = 'failed')`,
      withCpf: sql<number>`count(*) filter (where ${c2sLeads.cpf} is not null)`,
    })
    .from(c2sLeads)
    .where(gte(c2sLeads.receivedAt, dateFrom));

  const s = stats[0];
  const total = Number(s?.total || 0);
  const completed = Number(s?.completed || 0);
  const partial = Number(s?.partial || 0);
  const withCpf = Number(s?.withCpf || 0);

  return {
    generatedAt: new Date().toISOString(),
    period: "last_7_days",
    metrics: {
      totalLeads: total,
      completed,
      partial,
      pending: Number(s?.pending || 0),
      processing: Number(s?.processing || 0),
      failed: Number(s?.failed || 0),
      withCpf,
    },
    rates: {
      enrichmentRate:
        total > 0 ? `${(((completed + partial) / total) * 100).toFixed(1)}%` : "0%",
      cpfDiscoveryRate:
        total > 0 ? `${((withCpf / total) * 100).toFixed(1)}%` : "0%",
      completionRate:
        total > 0 ? `${((completed / total) * 100).toFixed(1)}%` : "0%",
    },
  };
}

export async function getHealthResource(
  container: ServiceContainer,
): Promise<unknown> {
  const healthChecks: Record<
    string,
    { status: string; latency?: number; message?: string }
  > = {};

  // Database check
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
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // CPF Lookup API check
  const cpfStart = Date.now();
  try {
    const isHealthy = await container.cpfLookup.healthCheck();
    healthChecks.cpfLookupApi = {
      status: isHealthy ? "healthy" : "unhealthy",
      latency: Date.now() - cpfStart,
    };
  } catch (error) {
    healthChecks.cpfLookupApi = {
      status: "unhealthy",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Configuration checks
  try {
    const { getConfig } = await import("../../config");
    const config = getConfig();

    healthChecks.workApi = {
      status: config.WORK_API ? "configured" : "missing",
      message: config.WORK_API ? "API key present" : "API key not set",
    };

    healthChecks.c2sApi = {
      status: config.C2S_TOKEN ? "configured" : "missing",
      message: config.C2S_TOKEN ? "Token present" : "Token not set",
    };
  } catch {
    healthChecks.configuration = {
      status: "error",
      message: "Failed to load configuration",
    };
  }

  const allHealthy = Object.values(healthChecks).every(
    (h) => h.status === "healthy" || h.status === "configured",
  );

  return {
    generatedAt: new Date().toISOString(),
    overall: allHealthy ? "healthy" : "degraded",
    services: healthChecks,
  };
}
