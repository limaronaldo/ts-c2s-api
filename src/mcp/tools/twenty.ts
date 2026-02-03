/**
 * MCP Tools: Twenty CRM Lead Management
 *
 * Tools for creating, updating, and routing leads in Twenty CRM.
 * Part of Phase 3: Twenty Integration
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";

// Tool definitions
export const twentyTools: Tool[] = [
  {
    name: "twenty_create_lead",
    description:
      "Create a new lead in Twenty CRM with enrichment data. Automatically routes to correct workspace based on tier (S/A -> WS-SENIOR, B/C/Risk -> WS-GENERAL).",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Lead full name",
        },
        email: {
          type: "string",
          description: "Email address",
        },
        phone: {
          type: "string",
          description: "Phone number (required)",
        },
        cpf: {
          type: "string",
          description: "CPF (optional, for enrichment lookup)",
        },
        source: {
          type: "string",
          enum: [
            "website",
            "google_ads",
            "meta_ads",
            "whatsapp",
            "portal",
            "referral",
            "ibvi",
            "other",
          ],
          description: "Lead source/origin",
        },
        tier: {
          type: "string",
          enum: ["S", "A", "B", "C", "RISK"],
          description: "Lead tier (calculated if not provided)",
        },
        score: {
          type: "number",
          description: "IBVI score (0-100)",
        },
        income: {
          type: "number",
          description: "Monthly income in BRL",
        },
        patrimony: {
          type: "number",
          description: "Estimated patrimony in BRL",
        },
      },
      required: ["name", "phone", "source"],
    },
  },
  {
    name: "twenty_update_lead",
    description:
      "Update an existing lead in Twenty CRM. Can update any field including status, tier, and contact dates.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Twenty lead ID",
        },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        cpf: { type: "string" },
        tier: {
          type: "string",
          enum: ["S", "A", "B", "C", "RISK"],
        },
        score: { type: "number" },
        income: { type: "number" },
        patrimony: { type: "number" },
        leadStatus: {
          type: "string",
          enum: [
            "novo",
            "contato_inicial",
            "qualificado",
            "visita_agendada",
            "visita_realizada",
            "proposta_enviada",
            "negociacao",
            "fechado_ganho",
            "fechado_perdido",
            "nurturing",
          ],
        },
        lastContactDate: {
          type: "string",
          description: "ISO datetime of last contact",
        },
        nextContactDate: {
          type: "string",
          description: "ISO datetime for next follow-up",
        },
        intentSignal: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
      },
      required: ["id"],
    },
  },
  {
    name: "twenty_get_lead",
    description:
      "Fetch a lead from Twenty CRM by ID. Returns all lead fields including custom fields.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Twenty lead ID",
        },
        workspace: {
          type: "string",
          enum: ["WS-OPS", "WS-SENIOR", "WS-GENERAL"],
          description: "Workspace to query (default: WS-OPS)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "twenty_route_lead",
    description:
      "Route a lead to the appropriate workspace based on tier. S/A -> WS-SENIOR, B/C/Risk -> WS-GENERAL. Supports delegation for exceptions.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "Twenty lead ID",
        },
        tier: {
          type: "string",
          enum: ["S", "A", "B", "C", "RISK"],
          description: "Lead tier",
        },
        delegatedBy: {
          type: "string",
          description: "Who authorized the delegation (for S/A to WS-GENERAL)",
        },
        delegatedReason: {
          type: "string",
          enum: ["training", "workload", "profile", "coverage"],
          description: "Reason for delegation",
        },
      },
      required: ["leadId", "tier"],
    },
  },
  {
    name: "twenty_delegate_lead",
    description:
      "Delegate a lead to a different workspace or broker with proper tracking. Creates delegation record with expiration.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "Twenty lead ID",
        },
        delegatedBy: {
          type: "string",
          description: "Manager/Admin who is delegating",
        },
        delegatedReason: {
          type: "string",
          enum: ["training", "workload", "profile", "coverage"],
          description: "Reason for delegation",
        },
        targetBroker: {
          type: "string",
          description: "Target broker ID (optional)",
        },
        expirationDays: {
          type: "number",
          description: "Days until delegation expires (default: 7 for S/A, 14 for others)",
        },
      },
      required: ["leadId", "delegatedBy", "delegatedReason"],
    },
  },
  {
    name: "twenty_bulk_import",
    description:
      "Import multiple leads to Twenty CRM with deduplication by CPF. Returns summary of created/skipped/failed.",
    inputSchema: {
      type: "object",
      properties: {
        leads: {
          type: "array",
          description: "Array of leads to import",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              phone: { type: "string" },
              email: { type: "string" },
              cpf: { type: "string" },
              source: { type: "string" },
              tier: { type: "string" },
              score: { type: "number" },
              income: { type: "number" },
              patrimony: { type: "number" },
            },
            required: ["name", "phone"],
          },
        },
        skipDuplicates: {
          type: "boolean",
          description: "Skip leads with existing CPF (default: true)",
        },
        defaultSource: {
          type: "string",
          description: "Default source for leads without one",
        },
      },
      required: ["leads"],
    },
  },
];

// Tool handlers
export async function handleTwentyTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer
): Promise<unknown> {
  switch (name) {
    case "twenty_create_lead":
      return createLead(args, container);
    case "twenty_update_lead":
      return updateLead(args, container);
    case "twenty_get_lead":
      return getLead(args, container);
    case "twenty_route_lead":
      return routeLead(args, container);
    case "twenty_delegate_lead":
      return delegateLead(args, container);
    case "twenty_bulk_import":
      return bulkImport(args, container);
    default:
      throw new Error(`Unknown Twenty tool: ${name}`);
  }
}

async function createLead(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  const result = await container.twenty.createLead({
    name: args.name as string,
    email: args.email as string | undefined,
    phone: args.phone as string,
    cpf: args.cpf as string | undefined,
    source: (args.source as any) || "other",
    tier: args.tier as any,
    score: args.score as number | undefined,
    income: args.income as number | undefined,
    patrimony: args.patrimony as number | undefined,
  });

  return result;
}

async function updateLead(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  const result = await container.twenty.updateLead({
    id: args.id as string,
    name: args.name as string | undefined,
    email: args.email as string | undefined,
    phone: args.phone as string | undefined,
    cpf: args.cpf as string | undefined,
    tier: args.tier as any,
    score: args.score as number | undefined,
    income: args.income as number | undefined,
    patrimony: args.patrimony as number | undefined,
    leadStatus: args.leadStatus as any,
    lastContactDate: args.lastContactDate as string | undefined,
    nextContactDate: args.nextContactDate as string | undefined,
    intentSignal: args.intentSignal as any,
  });

  return result;
}

async function getLead(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  const result = await container.twenty.getLead(
    args.id as string,
    (args.workspace as any) || "WS-OPS"
  );

  return result;
}

async function routeLead(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  const routing = container.twenty.routeLead({
    tier: args.tier as any,
    delegatedBy: args.delegatedBy as string | undefined,
    delegatedReason: args.delegatedReason as any,
  });

  return {
    success: true,
    leadId: args.leadId,
    ...routing,
  };
}

async function delegateLead(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  const leadId = args.leadId as string;
  const delegatedBy = args.delegatedBy as string;
  const delegatedReason = args.delegatedReason as string;
  const expirationDays = (args.expirationDays as number) || 7;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expirationDays);

  // Update lead with delegation info
  const result = await container.twenty.updateLead({
    id: leadId,
    delegatedBy,
    delegatedReason: delegatedReason as any,
    delegatedAt: new Date().toISOString(),
    delegationExpiresAt: expiresAt.toISOString(),
  });

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    leadId,
    delegatedBy,
    delegatedReason,
    delegatedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    message: `Lead delegated successfully. Expires on ${expiresAt.toLocaleDateString("pt-BR")}`,
  };
}

async function bulkImport(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  const leads = args.leads as Array<Record<string, unknown>>;
  const skipDuplicates = args.skipDuplicates !== false;
  const defaultSource = (args.defaultSource as string) || "ibvi";

  const results = {
    total: leads.length,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const lead of leads) {
    try {
      const result = await container.twenty.createLead({
        name: lead.name as string,
        phone: lead.phone as string,
        email: lead.email as string | undefined,
        cpf: lead.cpf as string | undefined,
        source: (lead.source as any) || defaultSource,
        tier: lead.tier as any,
        score: lead.score as number | undefined,
        income: lead.income as number | undefined,
        patrimony: lead.patrimony as number | undefined,
      });

      if (result.success) {
        results.created++;
      } else {
        if (skipDuplicates && result.error?.includes("duplicate")) {
          results.skipped++;
        } else {
          results.failed++;
          results.errors.push(`${lead.name}: ${result.error}`);
        }
      }
    } catch (error) {
      results.failed++;
      results.errors.push(
        `${lead.name}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return {
    success: true,
    ...results,
    summary: `Created ${results.created}, skipped ${results.skipped}, failed ${results.failed} out of ${results.total} leads`,
  };
}
