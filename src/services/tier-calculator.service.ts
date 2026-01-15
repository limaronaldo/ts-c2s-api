/**
 * Tier Calculator Service
 * RML-872: Análise profunda automática de leads
 *
 * Calculates lead tier based on multiple factors:
 * - Income/wealth
 * - Company/role
 * - Education
 * - Location (neighborhood)
 * - Family connections
 * - Risk factors
 */

import { logger } from "../utils/logger";
import {
  analyzeFullName,
  detectFamilyConnection,
  isInternationalPhone,
  type SurnameAnalysis,
} from "../utils/surname-analyzer";
import { isNobleNeighborhood } from "../utils/neighborhoods";
import type { RiskAssessment } from "./risk-detector.service";
import type { DomainAnalysis } from "./domain-analyzer.service";
import type { PersonInfo, CompanyInfo } from "./web-search.service";

const log = logger.child({ module: "tier-calculator" });

export type TierLevel = "platinum" | "gold" | "silver" | "bronze" | "risk";

export interface TierFactors {
  // Financial
  income?: number;
  estimatedWealth?: string;
  managedCapital?: string;

  // Professional
  company?: string;
  role?: string;
  sector?: string;
  isBusinessOwner?: boolean;
  companyCount?: number;

  // Education
  education?: string;
  isEliteEducation?: boolean;

  // Location
  neighborhood?: string;
  city?: string;
  state?: string;
  isNobleNeighborhood?: boolean;

  // Family
  surnameAnalysis?: SurnameAnalysis[];
  isNotableFamily?: boolean;
  familyContext?: string;
  hasFamilyConnection?: boolean;

  // Risk
  riskAssessment?: RiskAssessment;

  // Other
  isInternational?: boolean;
  country?: string;
  propertyCount?: number;
}

export interface TierResult {
  tier: TierLevel;
  tierLabel: string;
  score: number; // 0-100
  factors: TierFactors;
  highlights: string[];
  recommendation: {
    action: "avoid" | "priority" | "qualify" | "contact";
    title: string;
    description: string;
  };
}

// Elite education institutions
const ELITE_EDUCATION = new Set([
  "harvard",
  "stanford",
  "mit",
  "yale",
  "princeton",
  "columbia",
  "wharton",
  "insead",
  "london business school",
  "oxford",
  "cambridge",
  "hbs", // Harvard Business School
  "gsb", // Stanford GSB
]);

// Brazilian elite education
const BRAZILIAN_ELITE_EDUCATION = new Set([
  "usp",
  "fgv",
  "insper",
  "puc",
  "unicamp",
  "fea",
  "poli",
  "fea-usp",
  "ibmec",
]);

// High-value sectors
const HIGH_VALUE_SECTORS = new Set([
  "venture capital",
  "private equity",
  "banco",
  "banco de investimentos",
  "investimentos",
  "fintech",
  "tecnologia",
  "imobiliário",
]);

// High-value roles
const HIGH_VALUE_ROLES = new Set([
  "ceo",
  "cfo",
  "coo",
  "cto",
  "fundador",
  "co-fundador",
  "founder",
  "co-founder",
  "sócio",
  "partner",
  "managing partner",
  "diretor",
  "presidente",
  "vice-presidente",
  "vp",
]);

// Score weights
const WEIGHTS = {
  // Financial (max 35 points)
  highIncome: 15, // income > R$15k
  veryHighIncome: 25, // income > R$30k
  managedCapital: 35, // has managed capital (VC, PE)
  estimatedWealth: 20, // discovered wealth

  // Professional (max 30 points)
  highValueSector: 15,
  highValueRole: 15,
  businessOwner: 10,
  multipleCompanies: 10,

  // Education (max 20 points)
  eliteEducation: 20,
  brazilianElite: 10,

  // Location (max 15 points)
  nobleNeighborhood: 15,

  // Family (max 25 points)
  notableFamily: 25,
  rareSurname: 10,
  familyConnection: 5,

  // Other (max 10 points)
  international: 10,
  multipleProperties: 5,

  // Risk (negative)
  riskLow: -10,
  riskMedium: -30,
  riskHigh: -50,
  riskCritical: -100,
};

export class TierCalculatorService {
  /**
   * Calculate tier for a lead
   */
  calculate(
    name: string,
    phone?: string,
    email?: string,
    enrichmentData?: {
      income?: number;
      addresses?: Array<{
        neighborhood?: string;
        city?: string;
        state?: string;
      }>;
      propertyCount?: number;
    },
    analysisData?: {
      domainAnalysis?: DomainAnalysis;
      personInfo?: PersonInfo;
      companyInfo?: CompanyInfo;
      riskAssessment?: RiskAssessment;
      discoveredCompanies?: CompanyInfo[];
    },
  ): TierResult {
    const factors: TierFactors = {};
    const highlights: string[] = [];
    let score = 0;

    // 1. Analyze surname
    const surnameAnalysis = analyzeFullName(name);
    factors.surnameAnalysis = surnameAnalysis;

    for (const analysis of surnameAnalysis) {
      if (analysis.isNotableFamily) {
        factors.isNotableFamily = true;
        factors.familyContext = analysis.familyContext;
        score += WEIGHTS.notableFamily;
        highlights.push(`Família notável: ${analysis.familyContext}`);
      } else if (analysis.isRare && analysis.confidence > 60) {
        score += WEIGHTS.rareSurname;
        highlights.push(`Sobrenome raro: ${analysis.surname}`);
      }
    }

    // 2. Check international phone
    if (phone) {
      const phoneAnalysis = isInternationalPhone(phone);
      if (phoneAnalysis.isInternational) {
        factors.isInternational = true;
        factors.country = phoneAnalysis.country;
        score += WEIGHTS.international;
        highlights.push(
          `Lead internacional: ${phoneAnalysis.country || "País não identificado"}`,
        );
      }
    }

    // 3. Analyze income
    if (enrichmentData?.income) {
      factors.income = enrichmentData.income;
      if (enrichmentData.income >= 30000) {
        score += WEIGHTS.veryHighIncome;
        highlights.push(
          `Renda muito alta: R$ ${enrichmentData.income.toLocaleString("pt-BR")}/mês`,
        );
      } else if (enrichmentData.income >= 15000) {
        score += WEIGHTS.highIncome;
        highlights.push(
          `Renda alta: R$ ${enrichmentData.income.toLocaleString("pt-BR")}/mês`,
        );
      }
    }

    // 4. Analyze neighborhood
    if (enrichmentData?.addresses && enrichmentData.addresses.length > 0) {
      for (const addr of enrichmentData.addresses) {
        if (addr.neighborhood) {
          const isNoble = isNobleNeighborhood(addr.neighborhood);
          if (isNoble) {
            factors.neighborhood = addr.neighborhood;
            factors.city = addr.city;
            factors.state = addr.state;
            factors.isNobleNeighborhood = true;
            score += WEIGHTS.nobleNeighborhood;
            highlights.push(`Bairro nobre: ${addr.neighborhood}`);
            break;
          }
        }
      }
    }

    // 5. Analyze properties
    if (enrichmentData?.propertyCount && enrichmentData.propertyCount > 2) {
      factors.propertyCount = enrichmentData.propertyCount;
      score += WEIGHTS.multipleProperties;
      highlights.push(`${enrichmentData.propertyCount} imóveis registrados`);
    }

    // 6. Analyze domain/company from email
    if (analysisData?.domainAnalysis?.companyInfo) {
      const company = analysisData.domainAnalysis.companyInfo;
      factors.company = company.name;
      factors.sector = company.sector;

      if (
        company.sector &&
        HIGH_VALUE_SECTORS.has(company.sector.toLowerCase())
      ) {
        score += WEIGHTS.highValueSector;
        highlights.push(`Setor de alto valor: ${company.sector}`);
      }
    }

    // 7. Analyze person info from web search
    if (analysisData?.personInfo) {
      const person = analysisData.personInfo;

      if (person.company && !factors.company) {
        factors.company = person.company;
      }

      if (person.role) {
        factors.role = person.role;
        if (HIGH_VALUE_ROLES.has(person.role.toLowerCase())) {
          score += WEIGHTS.highValueRole;
          highlights.push(`Cargo de alto valor: ${person.role}`);
        }
      }

      if (person.education) {
        factors.education = person.education;
        const lowerEdu = person.education.toLowerCase();

        if ([...ELITE_EDUCATION].some((e) => lowerEdu.includes(e))) {
          factors.isEliteEducation = true;
          score += WEIGHTS.eliteEducation;
          highlights.push(`Formação de elite: ${person.education}`);
        } else if (
          [...BRAZILIAN_ELITE_EDUCATION].some((e) => lowerEdu.includes(e))
        ) {
          score += WEIGHTS.brazilianElite;
          highlights.push(`Formação de destaque: ${person.education}`);
        }
      }
    }

    // 8. Analyze discovered companies
    if (
      analysisData?.discoveredCompanies &&
      analysisData.discoveredCompanies.length > 0
    ) {
      factors.companyCount = analysisData.discoveredCompanies.length;

      if (analysisData.discoveredCompanies.length >= 2) {
        factors.isBusinessOwner = true;
        score += WEIGHTS.businessOwner;
        score += WEIGHTS.multipleCompanies;
        highlights.push(
          `Sócio de ${analysisData.discoveredCompanies.length} empresas`,
        );
      } else {
        factors.isBusinessOwner = true;
        score += WEIGHTS.businessOwner;
        highlights.push(
          `Empresário: ${analysisData.discoveredCompanies[0].name}`,
        );
      }
    }

    // 9. Check for managed capital (VC, PE indicators)
    if (
      analysisData?.companyInfo?.sector?.toLowerCase().includes("capital") ||
      analysisData?.companyInfo?.sector?.toLowerCase().includes("venture") ||
      analysisData?.companyInfo?.sector
        ?.toLowerCase()
        .includes("private equity")
    ) {
      factors.managedCapital = "Sim";
      score += WEIGHTS.managedCapital;
      highlights.push("Gestor de capital/investimentos");
    }

    // 10. Apply risk adjustments
    if (analysisData?.riskAssessment) {
      factors.riskAssessment = analysisData.riskAssessment;

      switch (analysisData.riskAssessment.riskLevel) {
        case "critical":
          score += WEIGHTS.riskCritical;
          break;
        case "high":
          score += WEIGHTS.riskHigh;
          break;
        case "medium":
          score += WEIGHTS.riskMedium;
          break;
        case "low":
          score += WEIGHTS.riskLow;
          break;
      }
    }

    // Calculate tier
    const tier = this.getTierFromScore(
      score,
      analysisData?.riskAssessment?.riskLevel,
    );
    const tierLabel = this.getTierLabel(tier);
    const recommendation = this.getRecommendation(
      tier,
      factors,
      analysisData?.riskAssessment,
    );

    // Ensure score is within bounds
    const finalScore = Math.max(0, Math.min(100, score));

    log.info(
      {
        name,
        tier,
        score: finalScore,
        highlights: highlights.length,
        hasRisk: !!analysisData?.riskAssessment?.alerts?.length,
      },
      "Tier calculated",
    );

    return {
      tier,
      tierLabel,
      score: finalScore,
      factors,
      highlights,
      recommendation,
    };
  }

  /**
   * Get tier from score
   */
  private getTierFromScore(
    score: number,
    riskLevel?: RiskAssessment["riskLevel"],
  ): TierLevel {
    // Risk override
    if (riskLevel === "critical" || riskLevel === "high") {
      return "risk";
    }

    if (score >= 70) return "platinum";
    if (score >= 50) return "gold";
    if (score >= 30) return "silver";
    if (score < 0 || riskLevel === "medium") return "risk";
    return "bronze";
  }

  /**
   * Get tier label
   */
  private getTierLabel(tier: TierLevel): string {
    const labels: Record<TierLevel, string> = {
      platinum: "Platinum",
      gold: "Gold",
      silver: "Silver",
      bronze: "Bronze",
      risk: "Alto Risco",
    };
    return labels[tier];
  }

  /**
   * Get recommendation based on tier
   */
  private getRecommendation(
    tier: TierLevel,
    factors: TierFactors,
    riskAssessment?: RiskAssessment,
  ): TierResult["recommendation"] {
    switch (tier) {
      case "platinum":
        return {
          action: "priority",
          title: "Prioridade Máxima",
          description: this.buildPriorityDescription(factors),
        };

      case "gold":
        return {
          action: "priority",
          title: "Alta Prioridade",
          description:
            "Lead de alto valor. Contato prioritário com abordagem personalizada recomendada.",
        };

      case "silver":
        return {
          action: "qualify",
          title: "Qualificar",
          description:
            "Lead com potencial. Necessário qualificar interesse e capacidade antes de prosseguir.",
        };

      case "bronze":
        return {
          action: "contact",
          title: "Contatar",
          description:
            "Lead padrão. Seguir processo normal de contato e qualificação.",
        };

      case "risk":
        return {
          action: "avoid",
          title: "Evitar",
          description:
            riskAssessment?.recommendation ||
            "Lead com alto risco. Não recomendado prosseguir sem análise adicional.",
        };
    }
  }

  /**
   * Build priority description based on factors
   */
  private buildPriorityDescription(factors: TierFactors): string {
    const reasons: string[] = [];

    if (factors.isNotableFamily) {
      reasons.push(factors.familyContext || "família notável");
    }
    if (factors.isEliteEducation) {
      reasons.push(`formação em ${factors.education}`);
    }
    if (factors.managedCapital) {
      reasons.push("gestor de capital");
    }
    if (factors.income && factors.income >= 30000) {
      reasons.push("renda muito alta");
    }
    if (factors.isNobleNeighborhood) {
      reasons.push(`reside em ${factors.neighborhood}`);
    }

    if (reasons.length > 0) {
      return `Lead de altíssimo valor: ${reasons.join(", ")}. Abordagem premium e personalizada recomendada.`;
    }

    return "Lead de altíssimo valor. Abordagem premium e personalizada recomendada.";
  }
}
