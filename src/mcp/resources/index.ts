import type { Resource } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";
import { getStatsResource, getHealthResource } from "./stats";

// Define available resources
export function getAllResources(): Resource[] {
  return [
    {
      uri: "enrichment://stats",
      name: "Enrichment Statistics",
      description:
        "Current enrichment statistics including success rates and recent activity",
      mimeType: "application/json",
    },
    {
      uri: "enrichment://health",
      name: "Service Health",
      description: "Health status of all connected services",
      mimeType: "application/json",
    },
    {
      uri: "enrichment://recent",
      name: "Recent Leads",
      description: "Summary of recently received leads",
      mimeType: "application/json",
    },
  ];
}

// Handle resource read requests
export async function handleResourceRead(
  uri: string,
  container: ServiceContainer,
): Promise<unknown> {
  switch (uri) {
    case "enrichment://stats":
      return getStatsResource(container);

    case "enrichment://health":
      return getHealthResource(container);

    case "enrichment://recent":
      return getRecentLeadsResource(container);

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}

async function getRecentLeadsResource(
  container: ServiceContainer,
): Promise<unknown> {
  const db = container.dbStorage.getDb();
  const { c2sLeads } = await import("../../db/schema");
  const { desc, sql } = await import("drizzle-orm");

  // Get last 10 leads
  const recentLeads = await db
    .select({
      leadId: c2sLeads.leadId,
      customerName: c2sLeads.customerName,
      enrichmentStatus: c2sLeads.enrichmentStatus,
      cpf: c2sLeads.cpf,
      receivedAt: c2sLeads.receivedAt,
    })
    .from(c2sLeads)
    .orderBy(desc(c2sLeads.receivedAt))
    .limit(10);

  // Get status counts for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayStats = await db
    .select({
      status: c2sLeads.enrichmentStatus,
      count: sql<number>`count(*)`,
    })
    .from(c2sLeads)
    .where(sql`${c2sLeads.receivedAt} >= ${today}`)
    .groupBy(c2sLeads.enrichmentStatus);

  return {
    generatedAt: new Date().toISOString(),
    todaySummary: {
      total: todayStats.reduce((acc, s) => acc + Number(s.count), 0),
      byStatus: Object.fromEntries(
        todayStats.map((s) => [s.status, Number(s.count)]),
      ),
    },
    recentLeads: recentLeads.map((l) => ({
      leadId: l.leadId,
      name: l.customerName,
      status: l.enrichmentStatus,
      hasCpf: !!l.cpf,
      receivedAt: l.receivedAt,
    })),
  };
}
