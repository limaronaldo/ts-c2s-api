/**
 * MCP Tools - C2S CRM Integration
 *
 * Tools for interacting directly with C2S API:
 * - fetch_c2s_leads: Get leads from C2S with filters
 * - get_c2s_sellers: List all sellers
 * - send_c2s_message: Send message to a lead
 * - forward_c2s_lead: Forward lead to another seller
 * - search_c2s_by_phone: Find lead by phone number
 * - search_c2s_by_email: Find lead by email
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";
import { C2SService } from "../../services/c2s.service";

export const c2sTools: Tool[] = [
  {
    name: "fetch_c2s_leads",
    description:
      "Fetch leads directly from C2S CRM API with filters. Returns leads with customer info, status, seller, and dates. Use this to get fresh data from C2S, not from our local database.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "Page number (default: 1)",
        },
        perpage: {
          type: "number",
          description: "Results per page (max: 50, default: 20)",
        },
        status: {
          type: "string",
          description: "Filter by lead status (e.g., 'new', 'contacted', 'qualified')",
        },
        created_gte: {
          type: "string",
          description: "Filter leads created after this date (ISO format: 2026-01-01)",
        },
        created_lt: {
          type: "string",
          description: "Filter leads created before this date (ISO format: 2026-01-31)",
        },
        updated_gte: {
          type: "string",
          description: "Filter leads updated after this date (ISO format)",
        },
        updated_lt: {
          type: "string",
          description: "Filter leads updated before this date (ISO format)",
        },
        phone: {
          type: "string",
          description: "Filter by phone number",
        },
        email: {
          type: "string",
          description: "Filter by email address",
        },
        sort: {
          type: "string",
          description: "Sort order (e.g., '-created_at' for newest first)",
        },
      },
    },
  },
  {
    name: "get_c2s_sellers",
    description:
      "Get list of all sellers (sales reps) from C2S. Returns seller ID, name, and email. Useful for forwarding leads or filtering by seller.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "send_c2s_message",
    description:
      "Send a message/note to a lead in C2S. The message will appear in the lead's timeline. Use this to add enrichment results, notes, or any information to the lead record.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "C2S lead ID",
        },
        message: {
          type: "string",
          description: "Message content to add to the lead",
        },
        type: {
          type: "string",
          description: "Message type (optional)",
        },
      },
      required: ["leadId", "message"],
    },
  },
  {
    name: "forward_c2s_lead",
    description:
      "Forward a lead to another seller in C2S. Use get_c2s_sellers first to get available seller IDs.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "C2S lead ID to forward",
        },
        sellerId: {
          type: "string",
          description: "Target seller ID",
        },
      },
      required: ["leadId", "sellerId"],
    },
  },
  {
    name: "search_c2s_by_phone",
    description:
      "Search for a lead in C2S by phone number. Returns the lead with full details if found.",
    inputSchema: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description: "Phone number to search (with or without formatting)",
        },
      },
      required: ["phone"],
    },
  },
  {
    name: "search_c2s_by_email",
    description:
      "Search for a lead in C2S by email address. Returns the lead with full details if found.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Email address to search",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "mark_c2s_interacted",
    description:
      "Mark a lead as interacted in C2S. This updates the lead status to indicate contact was made.",
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
  {
    name: "get_c2s_tags",
    description:
      "Get all available tags from C2S. Tags can be used to categorize and filter leads.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Filter tags by name (optional)",
        },
      },
    },
  },
  {
    name: "add_c2s_lead_tag",
    description:
      "Add a tag to a lead in C2S. Use get_c2s_tags first to get available tag IDs.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "C2S lead ID",
        },
        tagId: {
          type: "string",
          description: "Tag ID to add",
        },
      },
      required: ["leadId", "tagId"],
    },
  },
];

/**
 * Format C2S lead for output
 */
function formatLead(lead: any) {
  return {
    id: lead.id,
    internalId: lead.internal_id,
    customer: C2SService.extractCustomerName(lead),
    phone: C2SService.extractPhone(lead),
    email: C2SService.extractEmail(lead),
    status: lead.status || lead.attributes?.lead_status?.name,
    statusAlias: lead.attributes?.lead_status?.alias,
    source: lead.source || lead.attributes?.lead_source?.name,
    product: lead.product || lead.attributes?.product?.description,
    description: lead.description || lead.attributes?.description,
    sellerId: lead.seller_id,
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
  };
}

export async function handleC2STool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "fetch_c2s_leads": {
      const {
        page = 1,
        perpage = 20,
        status,
        created_gte,
        created_lt,
        updated_gte,
        updated_lt,
        phone,
        email,
        sort = "-created_at",
      } = args as {
        page?: number;
        perpage?: number;
        status?: string;
        created_gte?: string;
        created_lt?: string;
        updated_gte?: string;
        updated_lt?: string;
        phone?: string;
        email?: string;
        sort?: string;
      };

      try {
        const response = await container.c2s.getLeads({
          page,
          perpage: Math.min(perpage, 50),
          status,
          created_gte,
          created_lt,
          updated_gte,
          updated_lt,
          phone,
          email,
          sort,
        });

        return {
          success: true,
          source: "c2s_api",
          total: response.meta?.total || response.data.length,
          page: response.meta?.page || page,
          perpage: response.meta?.perpage || perpage,
          leads: response.data.map(formatLead),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to fetch from C2S",
        };
      }
    }

    case "get_c2s_sellers": {
      try {
        const response = await container.c2s.getSellers();

        return {
          success: true,
          source: "c2s_api",
          count: response.data.length,
          sellers: response.data.map((s) => ({
            id: s.id,
            name: s.name,
            email: s.email,
          })),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to fetch sellers",
        };
      }
    }

    case "send_c2s_message": {
      const { leadId, message, type } = args as {
        leadId: string;
        message: string;
        type?: string;
      };

      try {
        await container.c2s.createMessage(leadId, message, type);

        return {
          success: true,
          leadId,
          messageLength: message.length,
          message: "Message sent successfully",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to send message",
        };
      }
    }

    case "forward_c2s_lead": {
      const { leadId, sellerId } = args as {
        leadId: string;
        sellerId: string;
      };

      try {
        const response = await container.c2s.forwardLead(leadId, sellerId);

        return {
          success: true,
          leadId,
          forwardedTo: sellerId,
          lead: formatLead(response.data),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to forward lead",
        };
      }
    }

    case "search_c2s_by_phone": {
      const { phone } = args as { phone: string };

      // Normalize phone
      const normalizedPhone = phone.replace(/\D/g, "");

      try {
        const lead = await container.c2s.findLeadByPhone(normalizedPhone);

        if (!lead) {
          return {
            success: true,
            found: false,
            phone: normalizedPhone,
            message: "No lead found with this phone number",
          };
        }

        return {
          success: true,
          found: true,
          phone: normalizedPhone,
          lead: formatLead(lead),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to search",
        };
      }
    }

    case "search_c2s_by_email": {
      const { email } = args as { email: string };

      try {
        const lead = await container.c2s.findLeadByEmail(email);

        if (!lead) {
          return {
            success: true,
            found: false,
            email,
            message: "No lead found with this email",
          };
        }

        return {
          success: true,
          found: true,
          email,
          lead: formatLead(lead),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to search",
        };
      }
    }

    case "mark_c2s_interacted": {
      const { leadId } = args as { leadId: string };

      try {
        await container.c2s.markLeadAsInteracted(leadId);

        return {
          success: true,
          leadId,
          message: "Lead marked as interacted",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to mark as interacted",
        };
      }
    }

    case "get_c2s_tags": {
      const { name } = args as { name?: string };

      try {
        const response = await container.c2s.getTags(name);

        return {
          success: true,
          source: "c2s_api",
          count: response.data.length,
          tags: response.data,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to fetch tags",
        };
      }
    }

    case "add_c2s_lead_tag": {
      const { leadId, tagId } = args as { leadId: string; tagId: string };

      try {
        await container.c2s.addLeadTag(leadId, tagId);

        return {
          success: true,
          leadId,
          tagId,
          message: "Tag added successfully",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to add tag",
        };
      }
    }

    default:
      throw new Error(`Unknown C2S tool: ${name}`);
  }
}
