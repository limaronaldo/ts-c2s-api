/**
 * MCP Tools - Tier Calculator
 * RML-995: Lead tier classification and recommendations
 *
 * Tools:
 * - calculate_lead_tier: Calculate tier (platinum/gold/silver/bronze/risk)
 * - get_tier_recommendation: Get action recommendation for a tier
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";
import type { TierLevel } from "../../services/tier-calculator.service";

export const tierTools: Tool[] = [
  {
    name: "calculate_lead_tier",
    description:
      "Calculate the tier classification (platinum/gold/silver/bronze/risk) for a lead based on multiple factors: income, location, surname, company, education, and risk indicators. Returns score (0-100), tier, highlights, and recommendation.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Lead's full name",
        },
        phone: {
          type: "string",
          description: "Phone number (for international check)",
        },
        email: {
          type: "string",
          description: "Email address (for domain analysis)",
        },
        income: {
          type: "number",
          description: "Monthly income in BRL",
        },
        neighborhood: {
          type: "string",
          description: "Neighborhood name",
        },
        city: {
          type: "string",
          description: "City",
        },
        state: {
          type: "string",
          description: "State (UF)",
        },
        propertyCount: {
          type: "number",
          description: "Number of properties owned",
        },
        company: {
          type: "string",
          description: "Company name (if known)",
        },
        role: {
          type: "string",
          description: "Job role/title (if known)",
        },
        education: {
          type: "string",
          description: "Education institution (if known)",
        },
        hasRiskFlags: {
          type: "boolean",
          description: "Whether the lead has risk indicators",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_tier_recommendation",
    description:
      "Get the recommended action and approach for a specific tier level. Returns action type (priority/qualify/contact/avoid), title, and detailed description.",
    inputSchema: {
      type: "object",
      properties: {
        tier: {
          type: "string",
          enum: ["platinum", "gold", "silver", "bronze", "risk"],
          description: "Tier level to get recommendation for",
        },
        context: {
          type: "string",
          description: "Additional context about the lead (optional)",
        },
      },
      required: ["tier"],
    },
  },
];

export async function handleTierTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "calculate_lead_tier": {
      const {
        name: leadName,
        phone,
        email,
        income,
        neighborhood,
        city,
        state,
        propertyCount,
        company,
        role,
        education,
        hasRiskFlags,
      } = args as {
        name: string;
        phone?: string;
        email?: string;
        income?: number;
        neighborhood?: string;
        city?: string;
        state?: string;
        propertyCount?: number;
        company?: string;
        role?: string;
        education?: string;
        hasRiskFlags?: boolean;
      };

      try {
        // Build enrichment data
        const enrichmentData = {
          income,
          addresses: neighborhood
            ? [{ neighborhood, city, state }]
            : undefined,
          propertyCount,
        };

        // Build analysis data
        let domainAnalysis;
        if (email) {
          try {
            domainAnalysis = await container.domainAnalyzer.analyzeDomain(email);
          } catch {
            // Ignore domain analysis errors
          }
        }

        const analysisData = {
          domainAnalysis,
          personInfo: company || role || education
            ? {
                company,
                role,
                education,
                source: "user_input",
              }
            : undefined,
          riskAssessment: hasRiskFlags
            ? {
                riskLevel: "medium" as const,
                riskScore: 50,
                alerts: [],
                negativeNews: [],
                recommendation: "Risk flags indicated - review before proceeding",
              }
            : undefined,
        };

        // Calculate tier
        const result = container.tierCalculator.calculate(
          leadName,
          phone,
          email,
          enrichmentData,
          analysisData,
        );

        return {
          success: true,
          name: leadName,
          tier: result.tier,
          tierLabel: result.tierLabel,
          score: result.score,
          highlights: result.highlights,
          recommendation: {
            action: result.recommendation.action,
            title: result.recommendation.title,
            description: result.recommendation.description,
          },
          factors: {
            hasNotableFamily: result.factors.isNotableFamily,
            familyContext: result.factors.familyContext,
            isNobleNeighborhood: result.factors.isNobleNeighborhood,
            neighborhood: result.factors.neighborhood,
            income: result.factors.income,
            isInternational: result.factors.isInternational,
            country: result.factors.country,
            company: result.factors.company,
            role: result.factors.role,
            sector: result.factors.sector,
            education: result.factors.education,
            isEliteEducation: result.factors.isEliteEducation,
            isBusinessOwner: result.factors.isBusinessOwner,
            companyCount: result.factors.companyCount,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Tier calculation failed",
        };
      }
    }

    case "get_tier_recommendation": {
      const { tier, context } = args as {
        tier: TierLevel;
        context?: string;
      };

      const recommendations: Record<TierLevel, {
        action: string;
        title: string;
        description: string;
        approach: string[];
        timeline: string;
      }> = {
        platinum: {
          action: "priority",
          title: "Prioridade Máxima",
          description:
            "Lead de altíssimo valor. Indicadores de riqueza, família notável, ou perfil empresarial excepcional.",
          approach: [
            "Contato imediato pelo corretor mais experiente",
            "Abordagem premium e personalizada",
            "Preparar portfólio exclusivo",
            "Considerar visita presencial",
            "Pesquisar perfil completo antes do contato",
          ],
          timeline: "Contato em até 1 hora",
        },
        gold: {
          action: "priority",
          title: "Alta Prioridade",
          description:
            "Lead de alto valor com bons indicadores de renda, localização ou perfil profissional.",
          approach: [
            "Contato prioritário",
            "Abordagem personalizada baseada no perfil",
            "Destacar imóveis de alto padrão",
            "Agendar visita rapidamente",
          ],
          timeline: "Contato em até 4 horas",
        },
        silver: {
          action: "qualify",
          title: "Qualificar",
          description:
            "Lead com potencial. Necessário qualificar interesse e capacidade financeira.",
          approach: [
            "Qualificar interesse e orçamento",
            "Entender necessidades específicas",
            "Apresentar opções compatíveis",
            "Avaliar timing de compra",
          ],
          timeline: "Contato em até 24 horas",
        },
        bronze: {
          action: "contact",
          title: "Contatar",
          description: "Lead padrão. Seguir processo normal de qualificação.",
          approach: [
            "Contato padrão",
            "Qualificar interesse básico",
            "Direcionar para opções adequadas",
            "Manter em nutrição se não converter",
          ],
          timeline: "Contato em até 48 horas",
        },
        risk: {
          action: "avoid",
          title: "Evitar/Revisar",
          description:
            "Lead com indicadores de risco. Não prosseguir sem análise adicional.",
          approach: [
            "Revisar indicadores de risco",
            "Consultar compliance se necessário",
            "Não prosseguir se risco confirmado",
            "Documentar decisão",
          ],
          timeline: "Análise antes de qualquer contato",
        },
      };

      const rec = recommendations[tier];
      if (!rec) {
        return {
          success: false,
          error: `Invalid tier: ${tier}. Valid tiers: platinum, gold, silver, bronze, risk`,
        };
      }

      return {
        success: true,
        tier,
        recommendation: {
          action: rec.action,
          title: rec.title,
          description: rec.description,
          approach: rec.approach,
          suggestedTimeline: rec.timeline,
        },
        context: context || null,
      };
    }

    default:
      throw new Error(`Unknown tier tool: ${name}`);
  }
}
