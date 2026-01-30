import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";

export const enrichmentTools: Tool[] = [
  {
    name: "enrich_lead",
    description:
      "Enrich a lead with CPF discovery and Work API data. Returns person details including income, addresses, phone numbers, emails, and property ownership. Requires at least a phone number or email.",
    inputSchema: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description: "Phone number with DDD (e.g., 11999887766)",
        },
        email: {
          type: "string",
          description: "Email address",
        },
        name: {
          type: "string",
          description:
            "Person name (improves CPF matching accuracy when provided)",
        },
        leadId: {
          type: "string",
          description: "Optional C2S lead ID to update with enrichment results",
        },
      },
    },
  },
  {
    name: "enrich_bulk",
    description:
      "Enrich multiple leads in batch. Processes leads sequentially with rate limiting to avoid API throttling. Returns summary with success/failure counts.",
    inputSchema: {
      type: "object",
      properties: {
        leads: {
          type: "array",
          description: "Array of leads to enrich",
          items: {
            type: "object",
            properties: {
              phone: { type: "string" },
              email: { type: "string" },
              name: { type: "string" },
              leadId: { type: "string" },
            },
          },
        },
        batchSize: {
          type: "number",
          description: "Number of leads to process before pausing (default: 10)",
        },
        delayMs: {
          type: "number",
          description: "Delay between batches in milliseconds (default: 2000)",
        },
      },
      required: ["leads"],
    },
  },
  {
    name: "retry_failed",
    description:
      "Retry enrichment for leads that previously failed or have partial data. Useful for recovering from temporary API failures.",
    inputSchema: {
      type: "object",
      properties: {
        leadIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Specific lead IDs to retry. If not provided, retries all failed leads.",
        },
        limit: {
          type: "number",
          description: "Maximum number of leads to retry (default: 50)",
        },
        statuses: {
          type: "array",
          items: { type: "string" },
          description:
            "Statuses to retry: 'failed', 'partial', 'unenriched' (default: all)",
        },
      },
    },
  },
];

export async function handleEnrichmentTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "enrich_lead": {
      const { phone, email, name: personName, leadId } = args as {
        phone?: string;
        email?: string;
        name?: string;
        leadId?: string;
      };

      if (!phone && !email) {
        return {
          success: false,
          error: "At least phone or email is required for enrichment",
        };
      }

      const result = await container.enrichment.enrichLead({
        leadId: leadId || `mcp_${Date.now()}`,
        name: personName || "Unknown",
        phone,
        email,
        source: "mcp",
      });

      return {
        success: result.success,
        enriched: result.enriched,
        cpf: result.cpf,
        partyId: result.partyId,
        message: result.message,
        partialEnrichment: result.partialEnrichment,
      };
    }

    case "enrich_bulk": {
      const {
        leads,
        batchSize = 10,
        delayMs = 2000,
      } = args as {
        leads: Array<{
          phone?: string;
          email?: string;
          name?: string;
          leadId?: string;
        }>;
        batchSize?: number;
        delayMs?: number;
      };

      if (!leads || leads.length === 0) {
        return {
          success: false,
          error: "No leads provided for bulk enrichment",
        };
      }

      const results: Array<{
        leadId: string;
        success: boolean;
        cpf?: string;
        error?: string;
      }> = [];

      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];

        try {
          const result = await container.enrichment.enrichLead({
            leadId: lead.leadId || `mcp_bulk_${Date.now()}_${i}`,
            name: lead.name || "Unknown",
            phone: lead.phone,
            email: lead.email,
            source: "mcp_bulk",
          });

          results.push({
            leadId: lead.leadId || `index_${i}`,
            success: result.success,
            cpf: result.cpf,
          });

          if (result.success) successCount++;
          else failureCount++;
        } catch (error) {
          results.push({
            leadId: lead.leadId || `index_${i}`,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          failureCount++;
        }

        // Rate limiting between batches
        if ((i + 1) % batchSize === 0 && i < leads.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      return {
        success: true,
        total: leads.length,
        successCount,
        failureCount,
        successRate: `${((successCount / leads.length) * 100).toFixed(1)}%`,
        results,
      };
    }

    case "retry_failed": {
      const {
        leadIds,
        limit = 50,
        statuses = ["failed", "partial", "unenriched"],
      } = args as {
        leadIds?: string[];
        limit?: number;
        statuses?: string[];
      };

      // Get leads to retry from database
      const leadsToRetry = await container.dbStorage.getC2SLeadsByStatus(
        statuses,
        limit,
      );

      // Filter by specific IDs if provided
      const filtered = leadIds
        ? leadsToRetry.filter((l) => leadIds.includes(l.leadId))
        : leadsToRetry;

      if (filtered.length === 0) {
        return {
          success: true,
          message: "No leads found to retry",
          total: 0,
        };
      }

      const results: Array<{
        leadId: string;
        previousStatus: string;
        newStatus: string;
        cpf?: string;
      }> = [];

      for (const lead of filtered) {
        try {
          const result = await container.enrichment.enrichLead({
            leadId: lead.leadId,
            name: lead.customerName || "Unknown",
            phone: lead.customerPhoneNormalized || undefined,
            email: lead.customerEmail || undefined,
            source: "mcp_retry",
          });

          results.push({
            leadId: lead.leadId,
            previousStatus: lead.enrichmentStatus || "unknown",
            newStatus: result.success ? "completed" : "partial",
            cpf: result.cpf,
          });
        } catch {
          results.push({
            leadId: lead.leadId,
            previousStatus: lead.enrichmentStatus || "unknown",
            newStatus: "failed",
          });
        }

        // Small delay between retries
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const improved = results.filter(
        (r) => r.newStatus === "completed" || r.cpf,
      ).length;

      return {
        success: true,
        total: results.length,
        improved,
        improvementRate: `${((improved / results.length) * 100).toFixed(1)}%`,
        results,
      };
    }

    default:
      throw new Error(`Unknown enrichment tool: ${name}`);
  }
}
