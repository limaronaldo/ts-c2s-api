/**
 * Quality Scoring MCP Tools
 * RML-991: Lead quality scoring and batch analysis
 *
 * Tools:
 * - score_lead_quality: Calculate 0-100 quality score with breakdown
 * - batch_score_quality: Score multiple leads at once
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";
import type { LeadQualityInput } from "../../services/lead-quality.service";

export const qualityTools: Tool[] = [
  {
    name: "score_lead_quality",
    description:
      "Calculate lead quality score (0-100) based on data completeness, income, location, contact validity, and enrichment status. Returns grade (A-F), category (premium/high/standard/low/poor), detailed breakdown by factor, flags (spam, noble_neighborhood, etc), and recommendations.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Lead name (from original input)",
        },
        phone: {
          type: "string",
          description: "Phone number with DDD",
        },
        email: {
          type: "string",
          description: "Email address",
        },
        source: {
          type: "string",
          description: "Lead source (e.g., Google Ads, website)",
        },
        cpf: {
          type: "string",
          description: "CPF if discovered",
        },
        enrichedName: {
          type: "string",
          description: "Name from enrichment (more accurate)",
        },
        income: {
          type: "number",
          description: "Income from enrichment (R$/month)",
        },
        presumedIncome: {
          type: "number",
          description: "Presumed income if exact not available",
        },
        addresses: {
          type: "array",
          description: "List of addresses from enrichment",
          items: {
            type: "object",
            properties: {
              neighborhood: { type: "string" },
              city: { type: "string" },
              state: { type: "string" },
            },
          },
        },
        companyCount: {
          type: "number",
          description: "Number of companies associated with person",
        },
        enrichmentStatus: {
          type: "string",
          description: "Status: completed, partial, pending, failed",
        },
        cpfSource: {
          type: "string",
          description: "CPF discovery source tier",
        },
      },
    },
  },
  {
    name: "batch_score_quality",
    description:
      "Score multiple leads at once. Returns individual scores plus summary statistics (average score, grade distribution, top leads). Useful for batch analysis and lead prioritization.",
    inputSchema: {
      type: "object",
      properties: {
        leads: {
          type: "array",
          description: "Array of leads to score",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Lead identifier" },
              name: { type: "string" },
              phone: { type: "string" },
              email: { type: "string" },
              cpf: { type: "string" },
              income: { type: "number" },
              addresses: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    neighborhood: { type: "string" },
                    city: { type: "string" },
                    state: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      required: ["leads"],
    },
  },
];

export async function handleQualityTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "score_lead_quality": {
      const input = args as LeadQualityInput;

      // Calculate quality score
      const result = container.leadQuality.calculateScore(input);

      // Format for display
      const formatted = container.leadQuality.formatScore(result);

      return {
        success: true,
        score: result.score,
        grade: result.grade,
        category: result.category,
        formatted,
        breakdown: {
          dataCompleteness: {
            score: result.breakdown.dataCompleteness,
            max: 30,
            description: "Name, phone, email, CPF presence and quality",
          },
          incomeScore: {
            score: result.breakdown.incomeScore,
            max: 25,
            description: "Income level from enrichment",
          },
          locationScore: {
            score: result.breakdown.locationScore,
            max: 15,
            description: "Address quality and noble neighborhood detection",
          },
          contactValidity: {
            score: result.breakdown.contactValidity,
            max: 20,
            description: "Phone format, DDD validation, email domain",
          },
          enrichmentBonus: {
            score: result.breakdown.enrichmentBonus,
            max: 10,
            description: "Bonus for enriched data and company info",
          },
        },
        flags: result.flags,
        recommendations: result.recommendations,
        input: {
          hasName: !!input.name || !!input.enrichedName,
          hasPhone: !!input.phone,
          hasEmail: !!input.email,
          hasCpf: !!input.cpf,
          hasIncome: !!(input.income || input.presumedIncome),
          hasAddresses: !!(input.addresses && input.addresses.length > 0),
        },
      };
    }

    case "batch_score_quality": {
      const { leads } = args as {
        leads: Array<{
          id?: string;
          name?: string;
          phone?: string;
          email?: string;
          cpf?: string;
          income?: number;
          addresses?: Array<{
            neighborhood?: string;
            city?: string;
            state?: string;
          }>;
        }>;
      };

      if (!leads || leads.length === 0) {
        return {
          success: false,
          error: "No leads provided for scoring",
        };
      }

      // Score each lead
      const scoredLeads = leads.map((lead, index) => {
        const input: LeadQualityInput = {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          cpf: lead.cpf,
          income: lead.income,
          addresses: lead.addresses,
        };

        const result = container.leadQuality.calculateScore(input);

        return {
          id: lead.id || `lead_${index + 1}`,
          name: lead.name || "Unknown",
          score: result.score,
          grade: result.grade,
          category: result.category,
          flags: result.flags,
        };
      });

      // Calculate summary statistics
      const scores = scoredLeads.map((l) => l.score);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      // Grade distribution
      const gradeDistribution = {
        A: scoredLeads.filter((l) => l.grade === "A").length,
        B: scoredLeads.filter((l) => l.grade === "B").length,
        C: scoredLeads.filter((l) => l.grade === "C").length,
        D: scoredLeads.filter((l) => l.grade === "D").length,
        F: scoredLeads.filter((l) => l.grade === "F").length,
      };

      // Category distribution
      const categoryDistribution = {
        premium: scoredLeads.filter((l) => l.category === "premium").length,
        high: scoredLeads.filter((l) => l.category === "high").length,
        standard: scoredLeads.filter((l) => l.category === "standard").length,
        low: scoredLeads.filter((l) => l.category === "low").length,
        poor: scoredLeads.filter((l) => l.category === "poor").length,
      };

      // Top leads (sorted by score)
      const topLeads = [...scoredLeads]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      // Leads needing attention
      const needsAttention = scoredLeads.filter(
        (l) => l.grade === "D" || l.grade === "F",
      );

      return {
        success: true,
        totalLeads: leads.length,
        summary: {
          averageScore: Math.round(avgScore * 10) / 10,
          highestScore: Math.max(...scores),
          lowestScore: Math.min(...scores),
          gradeDistribution,
          categoryDistribution,
        },
        topLeads,
        needsAttention: needsAttention.slice(0, 10),
        allScores: scoredLeads,
      };
    }

    default:
      throw new Error(`Unknown quality tool: ${name}`);
  }
}
