/**
 * High-Value Lead Detector (RML-810)
 *
 * Detects premium leads based on multiple criteria:
 * - Income > R$10k/month
 * - Notable family surname
 * - Multiple companies (>= 2)
 * - Noble neighborhood in SP/RJ
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
}

export interface HighValueResult {
  isHighValue: boolean;
  reasons: string[];
  details: {
    income?: number;
    neighborhood?: string;
    companies?: number;
    familyName?: string;
    familyContext?: string;
  };
}

// Thresholds
const HIGH_INCOME_THRESHOLD = 10000; // R$10k/month
const MIN_COMPANIES = 2;

/**
 * Check if a lead qualifies as high-value based on multiple criteria
 */
export function detectHighValueLead(criteria: HighValueCriteria): HighValueResult {
  const reasons: string[] = [];
  const details: HighValueResult["details"] = {};

  // 1. Check income (renda or rendaPresumida)
  const effectiveIncome = criteria.income || criteria.presumedIncome;
  if (effectiveIncome && effectiveIncome >= HIGH_INCOME_THRESHOLD) {
    const incomeFormatted = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(effectiveIncome);
    reasons.push(`Renda alta: ${incomeFormatted}/mês`);
    details.income = effectiveIncome;
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
    const capitalizedNeighborhood = nobleNeighborhood
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    reasons.push(`Bairro nobre: ${capitalizedNeighborhood}`);
    details.neighborhood = capitalizedNeighborhood;
  }

  // 3. Check companies
  if (criteria.companyCount && criteria.companyCount >= MIN_COMPANIES) {
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
        reasons.push(`Família notável: ${analysis.familyContext}`);
        details.familyName = analysis.surname;
        details.familyContext = analysis.familyContext;
        break; // Only report first notable family found
      } else if (analysis.isRare && analysis.confidence >= 70) {
        // Only report rare surnames with high confidence
        reasons.push(`Sobrenome raro: ${analysis.surname}`);
        details.familyName = analysis.surname;
        break; // Only report first rare surname found
      }
    }
  }

  return {
    isHighValue: reasons.length > 0,
    reasons,
    details,
  };
}

/**
 * Quick check if lead might be high-value (for filtering)
 */
export function mightBeHighValue(criteria: HighValueCriteria): boolean {
  const effectiveIncome = criteria.income || criteria.presumedIncome;

  // Quick checks without full analysis
  if (effectiveIncome && effectiveIncome >= HIGH_INCOME_THRESHOLD) return true;
  if (criteria.companyCount && criteria.companyCount >= MIN_COMPANIES) return true;

  // Check neighborhood
  if (criteria.neighborhood && findNobleNeighborhood(criteria.neighborhood)) return true;
  if (criteria.addresses) {
    for (const addr of criteria.addresses) {
      if (addr.neighborhood && findNobleNeighborhood(addr.neighborhood)) return true;
    }
  }

  return false;
}
