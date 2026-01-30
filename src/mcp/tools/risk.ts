/**
 * Risk Assessment MCP Tools
 * RML-989: Detect criminal, financial, legal, and reputation risks
 *
 * Tools:
 * - assess_risk: Full risk assessment with news search
 * - quick_risk_check: Fast check against known risks database
 * - analyze_text_risk: Check any text for risk keywords
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";

export const riskTools: Tool[] = [
  {
    name: "assess_risk",
    description:
      "Perform comprehensive risk assessment for a lead. Searches for negative news, checks against known risks database, and analyzes criminal, investigation, financial, reputation, and legal risks. Returns risk score (0-100), risk level (none/low/medium/high/critical), alerts with details, negative news found, and recommendation.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Person or company name to assess",
        },
        email: {
          type: "string",
          description: "Email address (optional, for additional context)",
        },
        phone: {
          type: "string",
          description: "Phone number (optional)",
        },
        company: {
          type: "string",
          description: "Associated company name (searched separately)",
        },
        cpf: {
          type: "string",
          description: "CPF number (optional)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "quick_risk_check",
    description:
      "Fast check against known risks database (no web search). Use this for quick screening before full assessment. Returns known risk alert if found, null otherwise. Known risks include people involved in CPI investigations, fraud cases, etc.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Person name to check against known risks",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "analyze_text_risk",
    description:
      "Analyze any text for risk keywords. Useful for checking lead descriptions, messages, or notes for red flags. Returns categorized risk alerts found in the text.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text to analyze for risk keywords",
        },
      },
      required: ["text"],
    },
  },
];

export async function handleRiskTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  switch (name) {
    case "assess_risk": {
      const {
        name: personName,
        email,
        phone,
        company,
        cpf,
      } = args as {
        name: string;
        email?: string;
        phone?: string;
        company?: string;
        cpf?: string;
      };

      if (!personName || personName.trim().length < 3) {
        return {
          success: false,
          error: "Name must be at least 3 characters",
        };
      }

      const result = await container.riskDetector.assessRisk(
        personName,
        email,
        phone,
        { company, cpf },
      );

      // Format severity labels
      const severityLabels = {
        low: "Baixo",
        medium: "Moderado",
        high: "Alto",
        critical: "Crítico",
      };

      const riskLevelLabels = {
        none: "Nenhum",
        low: "Baixo",
        medium: "Moderado",
        high: "Alto",
        critical: "Crítico",
      };

      // Risk type labels
      const typeLabels = {
        criminal: "Criminal",
        investigation: "Investigação",
        financial: "Financeiro",
        reputation: "Reputação",
        legal: "Legal",
      };

      return {
        success: true,
        name: personName,
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        riskLevelLabel: riskLevelLabels[result.riskLevel],
        isRisky: result.riskScore > 30,
        isCritical: result.riskLevel === "critical",
        alerts: result.alerts.map((alert) => ({
          type: alert.type,
          typeLabel: typeLabels[alert.type],
          severity: alert.severity,
          severityLabel: severityLabels[alert.severity],
          title: alert.title,
          description: alert.description,
          source: alert.source,
          keywords: alert.keywords,
        })),
        alertCount: result.alerts.length,
        negativeNews: result.negativeNews.map((news) => ({
          title: news.title,
          url: news.url,
          snippet: news.snippet,
          keywords: news.keywords,
        })),
        negativeNewsCount: result.negativeNews.length,
        recommendation: result.recommendation,
        summary:
          result.riskScore === 0
            ? `${personName}: Sem riscos identificados`
            : `${personName}: Risco ${riskLevelLabels[result.riskLevel]} (${result.riskScore}/100) - ${result.alerts.length} alerta(s)`,
      };
    }

    case "quick_risk_check": {
      const { name: personName } = args as { name: string };

      if (!personName || personName.trim().length < 3) {
        return {
          success: false,
          error: "Name must be at least 3 characters",
        };
      }

      const alert = container.riskDetector.quickCheck(personName);

      if (!alert) {
        return {
          success: true,
          name: personName,
          hasKnownRisk: false,
          message: "Nenhum risco conhecido encontrado para este nome",
        };
      }

      const severityLabels = {
        low: "Baixo",
        medium: "Moderado",
        high: "Alto",
        critical: "Crítico",
      };

      const typeLabels = {
        criminal: "Criminal",
        investigation: "Investigação",
        financial: "Financeiro",
        reputation: "Reputação",
        legal: "Legal",
      };

      return {
        success: true,
        name: personName,
        hasKnownRisk: true,
        warning: `⚠️ RISCO CONHECIDO: ${alert.title}`,
        alert: {
          type: alert.type,
          typeLabel: typeLabels[alert.type],
          severity: alert.severity,
          severityLabel: severityLabels[alert.severity],
          title: alert.title,
          description: alert.description,
          keywords: alert.keywords,
        },
        recommendation:
          alert.severity === "critical"
            ? "NÃO PROSSEGUIR com este lead"
            : "Análise manual recomendada antes de prosseguir",
      };
    }

    case "analyze_text_risk": {
      const { text } = args as { text: string };

      if (!text || text.trim().length < 10) {
        return {
          success: false,
          error: "Text must be at least 10 characters",
        };
      }

      const alerts = container.riskDetector.analyzeText(text);

      if (alerts.length === 0) {
        return {
          success: true,
          textLength: text.length,
          hasRiskKeywords: false,
          message: "Nenhuma palavra-chave de risco encontrada",
          alerts: [],
        };
      }

      const typeLabels = {
        criminal: "Criminal",
        investigation: "Investigação",
        financial: "Financeiro",
        reputation: "Reputação",
        legal: "Legal",
      };

      // Collect all found keywords
      const allKeywords = alerts.flatMap((a) => a.keywords);
      const uniqueKeywords = [...new Set(allKeywords)];

      return {
        success: true,
        textLength: text.length,
        hasRiskKeywords: true,
        keywordCount: uniqueKeywords.length,
        keywords: uniqueKeywords,
        alerts: alerts.map((alert) => ({
          type: alert.type,
          typeLabel: typeLabels[alert.type],
          severity: alert.severity,
          keywordsFound: alert.keywords,
        })),
        summary: `Encontradas ${uniqueKeywords.length} palavras-chave de risco em ${alerts.length} categoria(s)`,
      };
    }

    default:
      throw new Error(`Unknown risk tool: ${name}`);
  }
}
