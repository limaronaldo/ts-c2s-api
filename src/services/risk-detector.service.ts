/**
 * Risk Detector Service
 * RML-872: Análise profunda automática de leads
 *
 * Detects potential risks associated with leads by analyzing news,
 * public records, and known patterns.
 */

import { logger } from "../utils/logger";
import { WebSearchService, type NewsResult } from "./web-search.service";

const log = logger.child({ module: "risk-detector" });

export interface RiskAlert {
  type: "criminal" | "investigation" | "financial" | "reputation" | "legal";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  source?: string;
  keywords: string[];
}

export interface RiskAssessment {
  riskScore: number; // 0-100 (higher = more risky)
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  alerts: RiskAlert[];
  negativeNews: NewsResult[];
  recommendation: string;
}

// Risk keywords categorized by type
const RISK_KEYWORDS: Record<RiskAlert["type"], string[]> = {
  criminal: [
    "prisão",
    "preso",
    "condenado",
    "crime",
    "criminoso",
    "tráfico",
    "assassinato",
    "homicídio",
    "roubo",
    "furto",
    "sequestro",
  ],
  investigation: [
    "CPI",
    "investigação",
    "investigado",
    "indiciado",
    "operação",
    "PF",
    "Polícia Federal",
    "inquérito",
    "Ministério Público",
    "denúncia",
  ],
  financial: [
    "lavagem",
    "lavagem de dinheiro",
    "fraude",
    "sonegação",
    "evasão fiscal",
    "pirâmide",
    "esquema",
    "desvio",
    "corrupção",
    "propina",
    "caixa 2",
  ],
  reputation: [
    "tigrinho",
    "bet",
    "apostas ilegais",
    "jogo ilegal",
    "escândalo",
    "polêmica",
    "acusação",
    "denunciado",
    "cancelado",
  ],
  legal: [
    "processo",
    "ação judicial",
    "falência",
    "recuperação judicial",
    "dívida",
    "execução fiscal",
    "protesto",
    "negativado",
    "SPC",
    "Serasa",
  ],
};

// Known risky individuals/companies (names normalized to lowercase)
const KNOWN_RISKS = new Map<string, RiskAlert>([
  [
    "fernando oliveira lima",
    {
      type: "investigation",
      severity: "critical",
      title: "CPI das Bets - Indiciado",
      description: "Indiciado pela CPI das Bets do Senado por lavagem de dinheiro e associação criminosa. Apontado como responsável pelo Jogo do Tigrinho.",
      keywords: ["CPI", "tigrinho", "lavagem de dinheiro"],
    },
  ],
  [
    "fernandin oig",
    {
      type: "investigation",
      severity: "critical",
      title: "CPI das Bets - Investigado",
      description: "Investigado pela CPI das Bets. Movimentação financeira suspeita de R$ 110 milhões.",
      keywords: ["CPI", "tigrinho", "bet"],
    },
  ],
]);

// Risk score weights by type
const RISK_WEIGHTS: Record<RiskAlert["type"], number> = {
  criminal: 30,
  investigation: 25,
  financial: 25,
  reputation: 15,
  legal: 10,
};

// Severity multipliers
const SEVERITY_MULTIPLIERS: Record<RiskAlert["severity"], number> = {
  low: 0.5,
  medium: 1.0,
  high: 1.5,
  critical: 2.0,
};

export class RiskDetectorService {
  private webSearchService: WebSearchService;

  constructor(webSearchService?: WebSearchService) {
    this.webSearchService = webSearchService || new WebSearchService();
  }

  /**
   * Assess risk for a lead
   */
  async assessRisk(
    name: string,
    email?: string,
    phone?: string,
    additionalInfo?: {
      company?: string;
      cpf?: string;
    }
  ): Promise<RiskAssessment> {
    const alerts: RiskAlert[] = [];
    const negativeNews: NewsResult[] = [];
    let baseRiskScore = 0;

    // Check known risks first
    const normalizedName = name.toLowerCase().trim();
    const knownRisk = KNOWN_RISKS.get(normalizedName);
    if (knownRisk) {
      alerts.push(knownRisk);
      baseRiskScore += RISK_WEIGHTS[knownRisk.type] * SEVERITY_MULTIPLIERS[knownRisk.severity];
    }

    // Also check partial matches for known risks
    for (const [riskName, alert] of KNOWN_RISKS) {
      if (normalizedName.includes(riskName) || riskName.includes(normalizedName)) {
        if (!alerts.includes(alert)) {
          alerts.push(alert);
          baseRiskScore += RISK_WEIGHTS[alert.type] * SEVERITY_MULTIPLIERS[alert.severity] * 0.8;
        }
      }
    }

    // Search for negative news
    try {
      const allKeywords = Object.values(RISK_KEYWORDS).flat();
      const newsResults = await this.webSearchService.searchNews(
        `"${name}"`,
        allKeywords
      );

      for (const news of newsResults) {
        if (news.isNegative) {
          negativeNews.push(news);

          // Determine alert type based on keywords found
          const alertType = this.categorizeAlert(news.keywords);
          const severity = this.determineSeverity(news.keywords);

          const alert: RiskAlert = {
            type: alertType,
            severity,
            title: news.title,
            description: news.snippet,
            source: news.url,
            keywords: news.keywords,
          };

          // Avoid duplicate alerts
          if (!alerts.some((a) => a.source === alert.source)) {
            alerts.push(alert);
            baseRiskScore += RISK_WEIGHTS[alertType] * SEVERITY_MULTIPLIERS[severity];
          }
        }
      }
    } catch (error) {
      log.error({ error, name }, "Failed to search news for risk assessment");
    }

    // Search with company name if available
    if (additionalInfo?.company) {
      try {
        const companyNews = await this.webSearchService.searchNews(
          `"${additionalInfo.company}"`,
          Object.values(RISK_KEYWORDS).flat()
        );

        for (const news of companyNews) {
          if (news.isNegative && !negativeNews.some((n) => n.url === news.url)) {
            negativeNews.push(news);
            baseRiskScore += 5; // Lower weight for company news
          }
        }
      } catch (error) {
        log.debug({ error }, "Company risk search failed");
      }
    }

    // Calculate final score (cap at 100)
    const riskScore = Math.min(100, Math.round(baseRiskScore));

    // Determine risk level
    const riskLevel = this.getRiskLevel(riskScore);

    // Generate recommendation
    const recommendation = this.generateRecommendation(riskLevel, alerts);

    return {
      riskScore,
      riskLevel,
      alerts,
      negativeNews,
      recommendation,
    };
  }

  /**
   * Quick check against known risks (no web search)
   */
  quickCheck(name: string): RiskAlert | null {
    const normalizedName = name.toLowerCase().trim();

    // Direct match
    const directMatch = KNOWN_RISKS.get(normalizedName);
    if (directMatch) return directMatch;

    // Partial match
    for (const [riskName, alert] of KNOWN_RISKS) {
      if (normalizedName.includes(riskName) || riskName.includes(normalizedName)) {
        return alert;
      }
    }

    return null;
  }

  /**
   * Check text for risk keywords
   */
  analyzeText(text: string): RiskAlert[] {
    const alerts: RiskAlert[] = [];
    const lowerText = text.toLowerCase();

    for (const [type, keywords] of Object.entries(RISK_KEYWORDS) as [RiskAlert["type"], string[]][]) {
      const foundKeywords = keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));

      if (foundKeywords.length > 0) {
        alerts.push({
          type,
          severity: this.determineSeverity(foundKeywords),
          title: `Palavras-chave de risco encontradas: ${type}`,
          description: `Encontradas ${foundKeywords.length} palavras-chave de risco`,
          keywords: foundKeywords,
        });
      }
    }

    return alerts;
  }

  /**
   * Categorize alert based on keywords
   */
  private categorizeAlert(keywords: string[]): RiskAlert["type"] {
    let maxCount = 0;
    let bestType: RiskAlert["type"] = "reputation";

    for (const [type, typeKeywords] of Object.entries(RISK_KEYWORDS) as [RiskAlert["type"], string[]][]) {
      const count = keywords.filter((kw) =>
        typeKeywords.some((tk) => tk.toLowerCase() === kw.toLowerCase())
      ).length;

      if (count > maxCount) {
        maxCount = count;
        bestType = type;
      }
    }

    return bestType;
  }

  /**
   * Determine severity based on keywords
   */
  private determineSeverity(keywords: string[]): RiskAlert["severity"] {
    const criticalKeywords = ["prisão", "preso", "condenado", "CPI", "lavagem"];
    const highKeywords = ["investigação", "investigado", "indiciado", "fraude", "crime"];
    const mediumKeywords = ["processo", "denúncia", "acusação", "polêmica"];

    const lowerKeywords = keywords.map((k) => k.toLowerCase());

    if (lowerKeywords.some((k) => criticalKeywords.includes(k))) {
      return "critical";
    }
    if (lowerKeywords.some((k) => highKeywords.includes(k))) {
      return "high";
    }
    if (lowerKeywords.some((k) => mediumKeywords.includes(k))) {
      return "medium";
    }
    return "low";
  }

  /**
   * Get risk level from score
   */
  private getRiskLevel(score: number): RiskAssessment["riskLevel"] {
    if (score === 0) return "none";
    if (score < 20) return "low";
    if (score < 40) return "medium";
    if (score < 70) return "high";
    return "critical";
  }

  /**
   * Generate recommendation based on risk level
   */
  private generateRecommendation(level: RiskAssessment["riskLevel"], alerts: RiskAlert[]): string {
    switch (level) {
      case "none":
        return "Nenhum risco identificado. Prosseguir normalmente.";
      case "low":
        return "Risco baixo. Recomenda-se verificação adicional antes de prosseguir.";
      case "medium":
        return "Risco moderado. Análise manual recomendada antes de contato.";
      case "high":
        return "Risco alto. Não recomendado prosseguir sem aprovação da gestão.";
      case "critical":
        const criticalAlerts = alerts.filter((a) => a.severity === "critical");
        if (criticalAlerts.length > 0) {
          return `RISCO CRÍTICO: ${criticalAlerts[0].title}. NÃO PROSSEGUIR.`;
        }
        return "RISCO CRÍTICO. NÃO PROSSEGUIR com este lead.";
    }
  }
}
