/**
 * High-Value Lead Detector (RML-810, improved Jan 15 2026)
 *
 * Detects truly premium leads using STRICTER criteria.
 * A lead must meet multiple criteria or have very high individual scores.
 *
 * Tier System:
 * - PLATINUM: Multiple strong signals (auto-alert)
 * - GOLD: Strong income + one other factor (auto-alert)
 * - SILVER: Moderate signals (no alert, just logging)
 *
 * Criteria weights:
 * - Very high income (>= R$20k): 40 points
 * - High income (>= R$15k): 25 points
 * - Moderate income (>= R$10k): 10 points
 * - Notable family (Safra, Lemann, etc): 50 points
 * - Noble neighborhood (Jardins, Leblon): 15 points
 * - Multiple companies (>= 3): 20 points
 * - Rare surname with high confidence: 10 points
 *
 * Alert threshold: 50+ points
 */

import { findNobleNeighborhood } from "./neighborhoods";
import { analyzeFullName, type SurnameAnalysis } from "./surname-analyzer";

export interface HighValueCriteria {
  income?: number;
  presumedIncome?: number;
  neighborhood?: string;
  addresses?: Array<{ neighborhood?: string; city?: string; state?: string }>;
  companyCount?: number;
  leadName?: string;
  enrichedName?: string;
  // New criteria for improved detection
  propertyCount?: number; // Number of properties owned
  propertyValue?: number; // Total property value
  hasIbviProperties?: boolean; // Found in IBVI database
  netWorth?: number; // Patrimônio líquido
  occupation?: string; // Occupation/profession
  education?: string; // Education level
}

export interface HighValueResult {
  isHighValue: boolean;
  tier: "platinum" | "gold" | "silver" | "none";
  score: number;
  reasons: string[];
  details: {
    income?: number;
    neighborhood?: string;
    companies?: number;
    familyName?: string;
    familyContext?: string;
    properties?: number;
    propertyValue?: number;
    netWorth?: number;
    occupation?: string;
  };
}

// Thresholds - more strict
const VERY_HIGH_INCOME = 20000; // R$20k/month
const HIGH_INCOME = 15000; // R$15k/month
const MODERATE_INCOME = 10000; // R$10k/month
const MIN_COMPANIES_FOR_POINTS = 3; // Need 3+ companies to count

// Score thresholds
const PLATINUM_THRESHOLD = 60;
const GOLD_THRESHOLD = 50;
const ALERT_THRESHOLD = 50; // Only alert for Gold+ leads

// Point values
const POINTS = {
  veryHighIncome: 50, // R$20k+ (increased from 40 to trigger alerts alone)
  highIncome: 36, // R$15k+ (increased from 25)
  moderateIncome: 10,
  notableFamily: 50,
  nobleNeighborhood: 15,
  multipleCompanies: 20,
  rareSurname: 10,
  // New criteria points
  multipleProperties: 15, // 2+ properties
  highPropertyValue: 25, // R$2M+ in properties
  veryHighPropertyValue: 40, // R$5M+ in properties
  highNetWorth: 30, // R$1M+ net worth
  veryHighNetWorth: 45, // R$5M+ net worth
  executiveOccupation: 15, // CEO, Diretor, etc.
  professionalOccupation: 10, // Médico, Advogado, etc.
  graduateEducation: 5, // Pós-graduação, MBA
};

// High-value occupations
const EXECUTIVE_OCCUPATIONS = [
  "ceo",
  "diretor",
  "presidente",
  "vice-presidente",
  "sócio",
  "partner",
  "fundador",
  "founder",
  "empresário",
  "empresaria",
  "chairman",
  "c-level",
  "cfo",
  "cto",
  "coo",
  "cmo",
];

const PROFESSIONAL_OCCUPATIONS = [
  "médico",
  "medico",
  "advogado",
  "engenheiro",
  "arquiteto",
  "dentista",
  "cirurgião",
  "cirurgiao",
  "juiz",
  "desembargador",
  "promotor",
  "procurador",
  "investidor",
  "gestor de fundos",
  "banker",
  "private banker",
];

/**
 * Check if a lead qualifies as high-value based on weighted scoring
 */
export function detectHighValueLead(
  criteria: HighValueCriteria,
): HighValueResult {
  const reasons: string[] = [];
  const details: HighValueResult["details"] = {};
  let score = 0;

  // 1. Check income (renda or rendaPresumida)
  const effectiveIncome = criteria.income || criteria.presumedIncome;
  if (effectiveIncome) {
    const incomeFormatted = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(effectiveIncome);

    if (effectiveIncome >= VERY_HIGH_INCOME) {
      score += POINTS.veryHighIncome;
      reasons.push(`Renda muito alta: ${incomeFormatted}/mês`);
      details.income = effectiveIncome;
    } else if (effectiveIncome >= HIGH_INCOME) {
      score += POINTS.highIncome;
      reasons.push(`Renda alta: ${incomeFormatted}/mês`);
      details.income = effectiveIncome;
    } else if (effectiveIncome >= MODERATE_INCOME) {
      score += POINTS.moderateIncome;
      // Don't add to reasons for moderate income - it's a supporting factor only
      details.income = effectiveIncome;
    }
  }

  // 2. Check neighborhood (direct or from addresses)
  let nobleNeighborhood: string | null = null;

  if (criteria.neighborhood) {
    nobleNeighborhood = findNobleNeighborhood(criteria.neighborhood);
  }

  if (!nobleNeighborhood && criteria.addresses) {
    for (const addr of criteria.addresses) {
      if (addr.neighborhood) {
        nobleNeighborhood = findNobleNeighborhood(addr.neighborhood);
        if (nobleNeighborhood) break;
      }
    }
  }

  if (nobleNeighborhood) {
    score += POINTS.nobleNeighborhood;
    const capitalizedNeighborhood = nobleNeighborhood
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    reasons.push(`Bairro nobre: ${capitalizedNeighborhood}`);
    details.neighborhood = capitalizedNeighborhood;
  }

  // 3. Check companies - need 3+ to count
  if (
    criteria.companyCount &&
    criteria.companyCount >= MIN_COMPANIES_FOR_POINTS
  ) {
    score += POINTS.multipleCompanies;
    reasons.push(`${criteria.companyCount} empresas ativas`);
    details.companies = criteria.companyCount;
  }

  // 4. Check surname (notable family or rare surname)
  const nameToAnalyze = criteria.enrichedName || criteria.leadName;
  if (nameToAnalyze) {
    const surnameAnalyses = analyzeFullName(nameToAnalyze);

    // Check each surname for notable family or rare status
    for (const analysis of surnameAnalyses) {
      if (analysis.isNotableFamily && analysis.familyContext) {
        // Notable families get high points - this is a strong signal
        score += POINTS.notableFamily;
        reasons.push(`Família notável: ${analysis.familyContext}`);
        details.familyName = analysis.surname;
        details.familyContext = analysis.familyContext;
        break;
      } else if (analysis.isRare && analysis.confidence >= 80) {
        // Rare surnames only count with very high confidence (80+)
        score += POINTS.rareSurname;
        reasons.push(`Sobrenome raro: ${analysis.surname}`);
        details.familyName = analysis.surname;
        break;
      }
    }
  }

  // 5. Check property ownership
  if (criteria.propertyCount && criteria.propertyCount >= 2) {
    score += POINTS.multipleProperties;
    reasons.push(`${criteria.propertyCount} imóveis no cadastro`);
    details.properties = criteria.propertyCount;
  }

  // 6. Check property value
  if (criteria.propertyValue) {
    const valueFormatted = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(criteria.propertyValue);

    if (criteria.propertyValue >= 5000000) {
      score += POINTS.veryHighPropertyValue;
      reasons.push(`Patrimônio imobiliário: ${valueFormatted}`);
      details.propertyValue = criteria.propertyValue;
    } else if (criteria.propertyValue >= 2000000) {
      score += POINTS.highPropertyValue;
      reasons.push(`Patrimônio imobiliário: ${valueFormatted}`);
      details.propertyValue = criteria.propertyValue;
    }
  }

  // 7. Check net worth (patrimônio líquido)
  if (criteria.netWorth) {
    const worthFormatted = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(criteria.netWorth);

    if (criteria.netWorth >= 5000000) {
      score += POINTS.veryHighNetWorth;
      reasons.push(`Patrimônio líquido: ${worthFormatted}`);
      details.netWorth = criteria.netWorth;
    } else if (criteria.netWorth >= 1000000) {
      score += POINTS.highNetWorth;
      reasons.push(`Patrimônio líquido: ${worthFormatted}`);
      details.netWorth = criteria.netWorth;
    }
  }

  // 8. Check occupation
  if (criteria.occupation) {
    const occupationLower = criteria.occupation.toLowerCase();

    const isExecutive = EXECUTIVE_OCCUPATIONS.some((occ) =>
      occupationLower.includes(occ),
    );
    const isProfessional = PROFESSIONAL_OCCUPATIONS.some((occ) =>
      occupationLower.includes(occ),
    );

    if (isExecutive) {
      score += POINTS.executiveOccupation;
      reasons.push(`Cargo executivo: ${criteria.occupation}`);
      details.occupation = criteria.occupation;
    } else if (isProfessional) {
      score += POINTS.professionalOccupation;
      reasons.push(`Profissão de alto valor: ${criteria.occupation}`);
      details.occupation = criteria.occupation;
    }
  }

  // 9. Check education level
  if (criteria.education) {
    const educationLower = criteria.education.toLowerCase();
    const hasGraduate =
      educationLower.includes("pós") ||
      educationLower.includes("pos") ||
      educationLower.includes("mestrado") ||
      educationLower.includes("doutorado") ||
      educationLower.includes("mba") ||
      educationLower.includes("especialização") ||
      educationLower.includes("especializacao");

    if (hasGraduate) {
      score += POINTS.graduateEducation;
      // Don't add to reasons - it's a supporting factor
    }
  }

  // Determine tier based on score
  let tier: HighValueResult["tier"] = "none";
  if (score >= PLATINUM_THRESHOLD) {
    tier = "platinum";
  } else if (score >= GOLD_THRESHOLD) {
    tier = "gold";
  } else if (score >= 25) {
    // Silver for leads with some potential but not alert-worthy
    tier = "silver";
  }

  // Only mark as high-value if meets alert threshold
  const isHighValue = score >= ALERT_THRESHOLD;

  return {
    isHighValue,
    tier,
    score,
    reasons,
    details,
  };
}

/**
 * Quick check if lead might be high-value (for filtering)
 * More strict than before - need strong signals
 */
export function mightBeHighValue(criteria: HighValueCriteria): boolean {
  const effectiveIncome = criteria.income || criteria.presumedIncome;

  // Only quick-pass for very strong signals
  if (effectiveIncome && effectiveIncome >= HIGH_INCOME) return true;
  if (
    criteria.companyCount &&
    criteria.companyCount >= MIN_COMPANIES_FOR_POINTS
  )
    return true;

  // New criteria checks
  if (criteria.propertyValue && criteria.propertyValue >= 2000000) return true;
  if (criteria.netWorth && criteria.netWorth >= 1000000) return true;
  if (criteria.propertyCount && criteria.propertyCount >= 3) return true;

  return false;
}

/**
 * Format a concise summary for the alert
 */
export function formatHighValueSummary(result: HighValueResult): string {
  const tierEmoji = {
    platinum: "💎",
    gold: "🥇",
    silver: "🥈",
    none: "",
  };

  const lines: string[] = [];
  lines.push(
    `${tierEmoji[result.tier]} *${result.tier.toUpperCase()}* (Score: ${result.score})`,
  );

  if (result.reasons.length > 0) {
    lines.push("");
    lines.push("*Por que é premium:*");
    for (const reason of result.reasons) {
      lines.push(`• ${reason}`);
    }
  }

  return lines.join("\n");
}
