/**
 * MCP Tools: Twenty CRM Analytics
 *
 * Tools for pipeline stats, broker performance, and SLA monitoring.
 * Part of Phase 3: Twenty Integration
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";

// Tool definitions
export const twentyAnalyticsTools: Tool[] = [
  {
    name: "twenty_get_pipeline_stats",
    description:
      "Get pipeline statistics from Twenty CRM including total leads, distribution by tier and status, and total pipeline value.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "string",
          enum: ["WS-OPS", "WS-SENIOR", "WS-GENERAL"],
          description: "Workspace to query (default: WS-OPS for all)",
        },
        dateFrom: {
          type: "string",
          description: "Start date filter (ISO format)",
        },
        dateTo: {
          type: "string",
          description: "End date filter (ISO format)",
        },
      },
    },
  },
  {
    name: "twenty_get_broker_stats",
    description:
      "Get broker performance statistics including leads assigned, SLA compliance, and average time to first contact.",
    inputSchema: {
      type: "object",
      properties: {
        brokerId: {
          type: "string",
          description: "Specific broker ID (optional, returns all if not provided)",
        },
        workspace: {
          type: "string",
          enum: ["WS-OPS", "WS-SENIOR", "WS-GENERAL"],
        },
        period: {
          type: "string",
          enum: ["7d", "30d", "90d"],
          description: "Time period for stats (default: 30d)",
        },
      },
    },
  },
  {
    name: "twenty_get_adoption_metrics",
    description:
      "Get team adoption metrics: percentage of leads with nextContactDate filled, average time to first contact by tier.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "string",
          enum: ["WS-OPS", "WS-SENIOR", "WS-GENERAL"],
        },
        period: {
          type: "string",
          enum: ["7d", "30d", "90d"],
          description: "Time period (default: 30d)",
        },
      },
    },
  },
  {
    name: "twenty_check_sla_violations",
    description:
      "Find leads that violate SLA for first contact. SLA by tier: S=2h, A=24h, B=48h, C=72h.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "string",
          enum: ["WS-OPS", "WS-SENIOR", "WS-GENERAL"],
        },
        tierFilter: {
          type: "string",
          enum: ["S", "A", "B", "C", "RISK", "all"],
          description: "Filter by tier (default: all)",
        },
        limit: {
          type: "number",
          description: "Max results (default: 50)",
        },
        includeAssigned: {
          type: "boolean",
          description: "Include broker info (default: true)",
        },
      },
    },
  },
];

// Tool handlers
export async function handleTwentyAnalyticsTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer
): Promise<unknown> {
  switch (name) {
    case "twenty_get_pipeline_stats":
      return getPipelineStats(args, container);
    case "twenty_get_broker_stats":
      return getBrokerStats(args, container);
    case "twenty_get_adoption_metrics":
      return getAdoptionMetrics(args, container);
    case "twenty_check_sla_violations":
      return checkSlaViolations(args, container);
    default:
      throw new Error(`Unknown Twenty Analytics tool: ${name}`);
  }
}

async function getPipelineStats(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  const result = await container.twenty.getPipelineStats(
    (args.workspace as any) || "WS-OPS"
  );

  if (!result.success) {
    return result;
  }

  const stats = result.stats!;

  // Calculate percentages
  const tierPercentages: Record<string, string> = {};
  for (const [tier, count] of Object.entries(stats.byTier)) {
    const pct = stats.totalLeads > 0 
      ? ((count / stats.totalLeads) * 100).toFixed(1) 
      : "0";
    tierPercentages[tier] = `${pct}%`;
  }

  return {
    success: true,
    stats: {
      ...stats,
      tierPercentages,
      totalPipelineValueFormatted: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(stats.totalPipelineValue),
    },
  };
}

async function getBrokerStats(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  // TODO: Implement when Twenty query is available
  const period = (args.period as string) || "30d";
  
  return {
    success: true,
    period,
    brokers: [],
    message: "Broker stats will be available after Twenty integration is complete",
  };
}

async function getAdoptionMetrics(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  const period = (args.period as string) || "30d";

  // TODO: Implement actual queries
  return {
    success: true,
    period,
    metrics: {
      followUpRate: 0, // % leads with nextContactDate
      avgTimeToFirstContact: {
        S: 0,
        A: 0,
        B: 0,
        C: 0,
        overall: 0,
      },
      slaComplianceRate: 0, // % leads contacted within SLA
    },
    targets: {
      followUpRate: "> 80%",
      slaComplianceRate: "> 90%",
      avgTimeToFirstContact: "< 2h (S), < 24h (A), < 48h (B), < 72h (C)",
    },
    message: "Adoption metrics will be available after Twenty integration is complete",
  };
}

async function checkSlaViolations(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  const result = await container.twenty.findSlaViolations({
    workspace: args.workspace as any,
    tierFilter: (args.tierFilter as any) || "all",
    limit: (args.limit as number) || 50,
  });

  if (!result.success) {
    return result;
  }

  const violations = result.violations || [];

  // Add formatted info
  const formattedViolations = violations.map((v) => ({
    ...v,
    hoursOverdue: Math.round((v.hoursElapsed - v.slaHours) * 10) / 10,
    severity: v.tier === "S" ? "critical" : v.tier === "A" ? "high" : "medium",
  }));

  return {
    success: true,
    totalViolations: violations.length,
    violations: formattedViolations,
    slaReference: {
      S: "2 hours",
      A: "24 hours",
      B: "48 hours",
      C: "72 hours",
      RISK: "72 hours",
    },
  };
}
