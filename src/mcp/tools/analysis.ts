/**
 * Lead Analysis MCP Tools
 * RML-988: Deep multi-factor lead analysis with tier calculation
 *
 * Tools:
 * - analyze_lead: Full deep analysis (web search, risk, tier)
 * - get_lead_analysis: Retrieve cached analysis from database
 * - check_lead_alert: Check if lead should trigger an alert
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";
import type { LeadAnalysisInput } from "../../services/lead-analysis.service";

export const analysisTools: Tool[] = [
  {
    name: "analyze_lead",
    description:
      "Perform deep analysis of a lead including: domain analysis (from email), web search for LinkedIn/company/person info, risk detection (criminal/financial/legal/reputation), and tier calculation. Returns tier (platinum/gold/silver/bronze/risk), score (0-100), discovered info (company, role, education, LinkedIn), portfolio, alerts, highlights, and recommendation.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "Unique lead identifier (required for persistence)",
        },
        name: {
          type: "string",
          description: "Person full name",
        },
        email: {
          type: "string",
          description:
            "Email address (used for domain analysis to detect company)",
        },
        phone: {
          type: "string",
          description: "Phone number",
        },
        enrichmentData: {
          type: "object",
          description: "Optional enrichment data to enhance analysis",
          properties: {
            income: {
              type: "number",
              description: "Monthly income in R$",
            },
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
            propertyCount: {
              type: "number",
              description: "Number of properties owned",
            },
            cpf: {
              type: "string",
              description: "CPF number",
            },
          },
        },
      },
      required: ["leadId", "name"],
    },
  },
  {
    name: "get_lead_analysis",
    description:
      "Retrieve a previously saved lead analysis from the database. Use this to get cached analysis without running a new one. Returns null if no analysis exists for the lead.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "Lead ID to retrieve analysis for",
        },
      },
      required: ["leadId"],
    },
  },
  {
    name: "check_lead_alert",
    description:
      "Check if a lead should trigger a premium or risk alert based on existing analysis. Useful for quick decisions without full analysis. Returns alert type and recommendation.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "Lead ID to check for alerts",
        },
      },
      required: ["leadId"],
    },
  },
];

export async function handleAnalysisTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "analyze_lead": {
      const input = args as unknown as LeadAnalysisInput;

      if (!input.leadId || !input.name) {
        return {
          success: false,
          error: "leadId and name are required",
        };
      }

      if (input.name.trim().length < 3) {
        return {
          success: false,
          error: "Name must be at least 3 characters",
        };
      }

      const result = await container.leadAnalysis.analyze(input);

      // Tier labels in Portuguese
      const tierLabels: Record<string, string> = {
        platinum: "Platina",
        gold: "Ouro",
        silver: "Prata",
        bronze: "Bronze",
        risk: "Risco",
      };

      // Action labels
      const actionLabels: Record<string, string> = {
        avoid: "Evitar",
        priority: "Prioridade",
        qualify: "Qualificar",
        contact: "Contatar",
      };

      return {
        success: true,
        leadId: result.leadId,
        tier: result.tier,
        tierLabel: tierLabels[result.tier] || result.tierLabel,
        score: result.score,
        isPremium: result.tier === "platinum" || result.tier === "gold",
        isRisk: result.tier === "risk",
        discovered: {
          fullName: result.discovered.fullName,
          company: result.discovered.company,
          role: result.discovered.role,
          education: result.discovered.education,
          linkedIn: result.discovered.linkedIn,
          instagram: result.discovered.instagram,
          origin: result.discovered.origin,
          wealthEstimate: result.discovered.wealthEstimate,
        },
        portfolio: result.portfolio,
        assets: result.assets,
        alerts: result.alerts,
        alertCount: result.alerts.length,
        highlights: result.highlights,
        sources: result.sources,
        sourceCount: result.sources.length,
        recommendation: {
          action: result.recommendation.action,
          actionLabel: actionLabels[result.recommendation.action],
          title: result.recommendation.title,
          description: result.recommendation.description,
        },
        analysis: {
          durationMs: result.durationMs,
          version: result.analysisVersion,
        },
        summary: `${input.name}: ${tierLabels[result.tier]} (${result.score}/100) - ${result.recommendation.title}`,
      };
    }

    case "get_lead_analysis": {
      const { leadId } = args as { leadId: string };

      if (!leadId) {
        return {
          success: false,
          error: "leadId is required",
        };
      }

      const result = await container.leadAnalysis.getAnalysis(leadId);

      if (!result) {
        return {
          success: false,
          leadId,
          found: false,
          message: "No analysis found for this lead. Run analyze_lead first.",
        };
      }

      // Tier labels
      const tierLabels: Record<string, string> = {
        platinum: "Platina",
        gold: "Ouro",
        silver: "Prata",
        bronze: "Bronze",
        risk: "Risco",
      };

      return {
        success: true,
        leadId: result.leadId,
        found: true,
        tier: result.tier,
        tierLabel: tierLabels[result.tier] || result.tierLabel,
        score: result.score,
        discovered: result.discovered,
        portfolio: result.portfolio,
        alerts: result.alerts,
        highlights: result.highlights,
        recommendation: result.recommendation,
        cached: true,
      };
    }

    case "check_lead_alert": {
      const { leadId } = args as { leadId: string };

      if (!leadId) {
        return {
          success: false,
          error: "leadId is required",
        };
      }

      // Get existing analysis
      const analysis = await container.leadAnalysis.getAnalysis(leadId);

      if (!analysis) {
        return {
          success: true,
          leadId,
          hasAnalysis: false,
          shouldAlert: false,
          message:
            "No analysis available. Run analyze_lead first for alert detection.",
        };
      }

      // Determine if alert is needed
      const isPremium =
        analysis.tier === "platinum" || analysis.tier === "gold";
      const isRisk = analysis.tier === "risk" || analysis.alerts.length > 0;

      let alertType: "premium" | "risk" | "none" = "none";
      let alertMessage = "";

      if (isRisk) {
        alertType = "risk";
        alertMessage = analysis.alerts[0] || "Lead classificado como risco";
      } else if (isPremium) {
        alertType = "premium";
        alertMessage = `Lead Premium: ${analysis.tierLabel} (${analysis.score}/100)`;
      }

      return {
        success: true,
        leadId,
        hasAnalysis: true,
        shouldAlert: alertType !== "none",
        alertType,
        alertMessage,
        tier: analysis.tier,
        score: analysis.score,
        alertCount: analysis.alerts.length,
        recommendation: analysis.recommendation,
      };
    }

    default:
      throw new Error(`Unknown analysis tool: ${name}`);
  }
}
