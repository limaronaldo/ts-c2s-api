import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";

export const leadTools: Tool[] = [
  {
    name: "get_lead",
    description:
      "Get detailed information about a lead including enrichment status, customer data, and C2S details. Can search by lead ID or phone number.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "C2S lead ID",
        },
        phone: {
          type: "string",
          description: "Phone number to search by (alternative to leadId)",
        },
      },
    },
  },
  {
    name: "list_leads",
    description:
      "List leads with optional filters. Returns paginated results with enrichment status summary.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "processing", "completed", "partial", "failed"],
          description: "Filter by enrichment status",
        },
        sellerId: {
          type: "string",
          description: "Filter by seller ID",
        },
        limit: {
          type: "number",
          description: "Maximum results (default: 20, max: 100)",
        },
        offset: {
          type: "number",
          description: "Skip first N results for pagination",
        },
        dateFrom: {
          type: "string",
          description: "Filter leads received after this date (ISO format)",
        },
        dateTo: {
          type: "string",
          description: "Filter leads received before this date (ISO format)",
        },
      },
    },
  },
  {
    name: "get_c2s_lead_status",
    description:
      "Get the full C2S lead record including messages, seller info, and current status. Requires C2S API access.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "C2S lead ID",
        },
      },
      required: ["leadId"],
    },
  },
];

export async function handleLeadTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "get_lead": {
      const { leadId, phone } = args as {
        leadId?: string;
        phone?: string;
      };

      if (!leadId && !phone) {
        return {
          success: false,
          error: "Either leadId or phone is required",
        };
      }

      // Search by leadId first
      if (leadId) {
        const lead = await container.dbStorage.findC2SLeadByLeadId(leadId);

        if (lead) {
          return {
            success: true,
            source: "database",
            lead: {
              leadId: lead.leadId,
              internalId: lead.internalId,
              customerName: lead.customerName,
              customerEmail: lead.customerEmail,
              customerPhone: lead.customerPhone,
              customerPhoneNormalized: lead.customerPhoneNormalized,
              sellerId: lead.sellerId,
              sellerName: lead.sellerName,
              leadSource: lead.leadSource,
              leadStatus: lead.leadStatus,
              enrichmentStatus: lead.enrichmentStatus,
              cpf: lead.cpf,
              partyId: lead.partyId,
              retryCount: lead.retryCount,
              lastError: lead.lastError,
              receivedAt: lead.receivedAt,
              enrichedAt: lead.enrichedAt,
            },
          };
        }
      }

      // Search by phone if leadId not found or not provided
      if (phone) {
        const normalizedPhone = phone.replace(/\D/g, "");
        const db = container.dbStorage.getDb();
        const { c2sLeads } = await import("../../db/schema");
        const { eq } = await import("drizzle-orm");

        const leads = await db
          .select()
          .from(c2sLeads)
          .where(eq(c2sLeads.customerPhoneNormalized, normalizedPhone))
          .limit(5);

        if (leads.length > 0) {
          return {
            success: true,
            source: "database",
            matchedBy: "phone",
            leads: leads.map((lead) => ({
              leadId: lead.leadId,
              customerName: lead.customerName,
              customerPhone: lead.customerPhone,
              enrichmentStatus: lead.enrichmentStatus,
              cpf: lead.cpf,
              receivedAt: lead.receivedAt,
            })),
          };
        }
      }

      return {
        success: false,
        error: "Lead not found",
        searchedBy: leadId ? "leadId" : "phone",
      };
    }

    case "list_leads": {
      const {
        status,
        sellerId,
        limit = 20,
        offset = 0,
        dateFrom,
        dateTo,
      } = args as {
        status?: string;
        sellerId?: string;
        limit?: number;
        offset?: number;
        dateFrom?: string;
        dateTo?: string;
      };

      const effectiveLimit = Math.min(limit, 100);

      const db = container.dbStorage.getDb();
      const { c2sLeads } = await import("../../db/schema");
      const { eq, and, gte, lte, desc, sql } = await import("drizzle-orm");

      // Build conditions
      const conditions = [];

      if (status) {
        conditions.push(eq(c2sLeads.enrichmentStatus, status));
      }

      if (sellerId) {
        conditions.push(eq(c2sLeads.sellerId, sellerId));
      }

      if (dateFrom) {
        conditions.push(gte(c2sLeads.receivedAt, new Date(dateFrom)));
      }

      if (dateTo) {
        conditions.push(lte(c2sLeads.receivedAt, new Date(dateTo)));
      }

      // Query with conditions
      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const leads = await db
        .select({
          leadId: c2sLeads.leadId,
          customerName: c2sLeads.customerName,
          customerPhone: c2sLeads.customerPhoneNormalized,
          customerEmail: c2sLeads.customerEmail,
          sellerName: c2sLeads.sellerName,
          enrichmentStatus: c2sLeads.enrichmentStatus,
          cpf: c2sLeads.cpf,
          receivedAt: c2sLeads.receivedAt,
        })
        .from(c2sLeads)
        .where(whereClause)
        .orderBy(desc(c2sLeads.receivedAt))
        .limit(effectiveLimit)
        .offset(offset);

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(c2sLeads)
        .where(whereClause);

      const total = Number(countResult[0]?.count || 0);

      return {
        success: true,
        total,
        limit: effectiveLimit,
        offset,
        hasMore: offset + leads.length < total,
        leads,
      };
    }

    case "get_c2s_lead_status": {
      const { leadId } = args as { leadId: string };

      try {
        const c2sLead = await container.c2s.getLead(leadId);

        if (!c2sLead) {
          return {
            success: false,
            error: "Lead not found in C2S",
          };
        }

        return {
          success: true,
          source: "c2s_api",
          lead: c2sLead,
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch from C2S API",
        };
      }
    }

    default:
      throw new Error(`Unknown lead tool: ${name}`);
  }
}
