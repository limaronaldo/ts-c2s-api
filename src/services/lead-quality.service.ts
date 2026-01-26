/**
 * Lead Quality Score Service
 *
 * Scores leads from 0-100 based on:
 * - Data completeness (phone, email, name quality)
 * - Income level
 * - Location quality
 * - Contact validity
 * - Enrichment status
 *
 * Score ranges:
 * - 90-100: Premium (complete data, high income, noble area)
 * - 70-89: High Quality (good data, decent income)
 * - 50-69: Standard (basic data, some gaps)
 * - 30-49: Low Quality (missing data, unverified)
 * - 0-29: Poor (spam, invalid, or no useful data)
 */

import { findNobleNeighborhood } from "../utils/neighborhoods";
import { container } from "../container";

// Valid Brazilian DDDs for phone validation
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
  21, 22, 24, // RJ
  27, 28, // ES
  31, 32, 33, 34, 35, 37, 38, // MG
  41, 42, 43, 44, 45, 46, // PR
  47, 48, 49, // SC
  51, 53, 54, 55, // RS
  61, // DF
  62, 64, // GO
  63, // TO
  65, 66, // MT
  67, // MS
  68, // AC
  69, // RO
  71, 73, 74, 75, 77, // BA
  79, // SE
  81, 82, 83, 84, 85, 86, 87, 88, 89, // NE
  91, 92, 93, 94, 95, 96, 97, 98, 99, // Norte
]);

// Spam patterns to detect fake leads
const SPAM_PATTERNS = [
  /painel\s*fama/i,
  /sucesso\s*com\s*vendas/i,
  /ganhe\s*dinheiro/i,
  /renda\s*extra/i,
  /trabalhe\s*em\s*casa/i,
  /marketing\s*digital/i,
  /afiliado/i,
  /curso\s*online/i,
  /investimento/i,
  /cripto/i,
  /bitcoin/i,
  /forex/i,
  /teste\s*teste/i,
  /^teste$/i,
  /^test$/i,
];

export interface LeadQualityInput {
  // Basic lead info
  name?: string;
  phone?: string;
  email?: string;
  source?: string;

  // Enrichment data
  cpf?: string;
  enrichedName?: string;
  income?: number;
  presumedIncome?: number;
  addresses?: Array<{
    neighborhood?: string;
    city?: string;
    state?: string;
  }>;
  companyCount?: number;

  // Status
  enrichmentStatus?: string;
  cpfSource?: string;
}

export interface LeadQualityResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  category: "premium" | "high" | "standard" | "low" | "poor";
  breakdown: {
    dataCompleteness: number; // 0-30 points
    incomeScore: number; // 0-25 points
    locationScore: number; // 0-15 points
    contactValidity: number; // 0-20 points
    enrichmentBonus: number; // 0-10 points
  };
  flags: string[];
  recommendations: string[];
}

/**
 * Calculate lead quality score
 */
export function calculateLeadQualityScore(
  input: LeadQualityInput,
): LeadQualityResult {
  const breakdown = {
    dataCompleteness: 0,
    incomeScore: 0,
    locationScore: 0,
    contactValidity: 0,
    enrichmentBonus: 0,
  };
  const flags: string[] = [];
  const recommendations: string[] = [];

  // Check for spam first
  if (input.name && SPAM_PATTERNS.some((p) => p.test(input.name!))) {
    flags.push("spam_detected");
    return {
      score: 0,
      grade: "F",
      category: "poor",
      breakdown,
      flags,
      recommendations: ["Lead appears to be spam/bot - do not contact"],
    };
  }

  // 1. Data Completeness (max 30 points)
  // Name quality (0-10)
  if (input.enrichedName || input.name) {
    const name = input.enrichedName || input.name || "";
    const nameParts = name.trim().split(/\s+/);
    if (nameParts.length >= 3 && name.length >= 10) {
      breakdown.dataCompleteness += 10; // Full name
    } else if (nameParts.length >= 2 && name.length >= 5) {
      breakdown.dataCompleteness += 7; // Partial name
    } else if (name.length >= 3) {
      breakdown.dataCompleteness += 3; // Minimal name
    }
  } else {
    flags.push("missing_name");
    recommendations.push("Missing customer name");
  }

  // Phone (0-10)
  if (input.phone) {
    const phone = input.phone.replace(/\D/g, "");
    if (phone.length >= 10 && phone.length <= 13) {
      const ddd = parseInt(phone.slice(0, 2));
      if (VALID_DDDS.has(ddd)) {
        breakdown.dataCompleteness += 10; // Valid phone
      } else {
        breakdown.dataCompleteness += 3; // Phone exists but invalid DDD
        flags.push("invalid_ddd");
      }
    } else if (phone.length >= 8) {
      breakdown.dataCompleteness += 5; // Short phone
      flags.push("short_phone");
    }
  } else {
    flags.push("missing_phone");
    recommendations.push("No phone number provided");
  }

  // Email (0-5)
  if (input.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(input.email)) {
      breakdown.dataCompleteness += 5;
    } else {
      breakdown.dataCompleteness += 2;
      flags.push("invalid_email_format");
    }
  }

  // CPF (0-5)
  if (input.cpf) {
    breakdown.dataCompleteness += 5;
  }

  // 2. Income Score (max 25 points)
  const effectiveIncome = input.income || input.presumedIncome;
  if (effectiveIncome) {
    if (effectiveIncome >= 20000) {
      breakdown.incomeScore = 25; // R$20k+
    } else if (effectiveIncome >= 15000) {
      breakdown.incomeScore = 20; // R$15k+
    } else if (effectiveIncome >= 10000) {
      breakdown.incomeScore = 15; // R$10k+
    } else if (effectiveIncome >= 5000) {
      breakdown.incomeScore = 10; // R$5k+
    } else if (effectiveIncome >= 3000) {
      breakdown.incomeScore = 5; // R$3k+
    }
  }

  // 3. Location Score (max 15 points)
  if (input.addresses && input.addresses.length > 0) {
    let bestLocationScore = 0;

    for (const addr of input.addresses) {
      let addrScore = 5; // Base for having address

      // Check for noble neighborhood
      if (addr.neighborhood) {
        const noble = findNobleNeighborhood(addr.neighborhood);
        if (noble) {
          addrScore = 15; // Noble neighborhood
          flags.push("noble_neighborhood");
        } else {
          addrScore = 8; // Regular neighborhood
        }
      }

      // SP/RJ capital bonus
      if (
        addr.city?.toLowerCase().includes("são paulo") ||
        addr.city?.toLowerCase().includes("rio de janeiro")
      ) {
        addrScore = Math.min(addrScore + 2, 15);
      }

      bestLocationScore = Math.max(bestLocationScore, addrScore);
    }

    breakdown.locationScore = bestLocationScore;
  }

  // 4. Contact Validity (max 20 points)
  // Valid phone with 9-digit mobile
  if (input.phone) {
    const phone = input.phone.replace(/\D/g, "");
    const ddd = parseInt(phone.slice(0, 2));
    const hasNineDigit = phone.length >= 11 && phone[2] === "9";

    if (VALID_DDDS.has(ddd) && hasNineDigit) {
      breakdown.contactValidity += 15; // Valid mobile
    } else if (VALID_DDDS.has(ddd)) {
      breakdown.contactValidity += 10; // Valid but might be landline
    }
  }

  // Email domain quality
  if (input.email) {
    const domain = input.email.split("@")[1]?.toLowerCase();
    const premiumDomains = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"];
    const corporateDomains = [".com.br", ".com", ".net", ".org"];

    if (premiumDomains.includes(domain)) {
      breakdown.contactValidity += 5;
    } else if (corporateDomains.some((d) => domain?.endsWith(d))) {
      breakdown.contactValidity += 3;
    }
  }

  // 5. Enrichment Bonus (max 10 points)
  if (input.cpf && input.enrichedName) {
    breakdown.enrichmentBonus += 5; // Has CPF and enriched name
  }

  if (input.companyCount && input.companyCount >= 1) {
    breakdown.enrichmentBonus += 3; // Has company data
    if (input.companyCount >= 3) {
      breakdown.enrichmentBonus += 2; // Multiple companies
      flags.push("multiple_companies");
    }
  }

  // Calculate total score
  const score =
    breakdown.dataCompleteness +
    breakdown.incomeScore +
    breakdown.locationScore +
    breakdown.contactValidity +
    breakdown.enrichmentBonus;

  // Determine grade and category
  let grade: LeadQualityResult["grade"];
  let category: LeadQualityResult["category"];

  if (score >= 90) {
    grade = "A";
    category = "premium";
  } else if (score >= 70) {
    grade = "B";
    category = "high";
  } else if (score >= 50) {
    grade = "C";
    category = "standard";
  } else if (score >= 30) {
    grade = "D";
    category = "low";
  } else {
    grade = "F";
    category = "poor";
  }

  // Generate recommendations
  if (!input.cpf && input.phone) {
    recommendations.push("Try CPF discovery via phone");
  }
  if (!input.email && score < 70) {
    recommendations.push("Request email for follow-up");
  }
  if (!effectiveIncome && input.cpf) {
    recommendations.push("Enrich to get income data");
  }

  // Record metric
  container.prometheus.recordLeadQualityScore(score);

  return {
    score,
    grade,
    category,
    breakdown,
    flags,
    recommendations,
  };
}

/**
 * Quick quality check - returns true if lead is worth processing
 */
export function isLeadWorthProcessing(input: LeadQualityInput): boolean {
  // Check for spam
  if (input.name && SPAM_PATTERNS.some((p) => p.test(input.name!))) {
    return false;
  }

  // Must have phone or email
  if (!input.phone && !input.email) {
    return false;
  }

  // Check phone validity if provided
  if (input.phone) {
    const phone = input.phone.replace(/\D/g, "");
    if (phone.length < 8) return false;

    // Check for fake patterns
    if (/^(\d)\1{8,}$/.test(phone)) return false; // All same digit
    if (/^123456/.test(phone)) return false;
  }

  return true;
}

/**
 * Format quality score for display
 */
export function formatQualityScore(result: LeadQualityResult): string {
  const emoji = {
    A: "🌟",
    B: "✅",
    C: "📊",
    D: "⚠️",
    F: "❌",
  };

  return `${emoji[result.grade]} Grade ${result.grade} (${result.score}/100) - ${result.category.toUpperCase()}`;
}

export class LeadQualityService {
  calculateScore(input: LeadQualityInput): LeadQualityResult {
    return calculateLeadQualityScore(input);
  }

  isWorthProcessing(input: LeadQualityInput): boolean {
    return isLeadWorthProcessing(input);
  }

  formatScore(result: LeadQualityResult): string {
    return formatQualityScore(result);
  }
}
