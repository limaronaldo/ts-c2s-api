/**
 * Lead Analysis Service
 * RML-872: Análise profunda automática de leads
 *
 * Orchestrates the deep analysis of leads by coordinating:
 * - Domain analysis
 * - Web search
 * - Risk detection
 * - Tier calculation
 * - Database persistence
 */

import { logger } from "../utils/logger";
import {
  WebSearchService,
  type CompanyInfo,
  type PersonInfo,
} from "./web-search.service";
import {
  DomainAnalyzerService,
  type DomainAnalysis,
} from "./domain-analyzer.service";
import {
  RiskDetectorService,
  type RiskAssessment,
} from "./risk-detector.service";
import {
  TierCalculatorService,
  type TierResult,
  type TierLevel,
} from "./tier-calculator.service";
import { container } from "../container";
import { leadAnalyses, type NewLeadAnalysis } from "../db/schema";

const log = logger.child({ module: "lead-analysis" });

export interface LeadAnalysisInput {
  leadId: string;
  name: string;
  email?: string;
  phone?: string;
  enrichmentData?: {
    income?: number;
    addresses?: Array<{ neighborhood?: string; city?: string; state?: string }>;
    propertyCount?: number;
    cpf?: string;
  };
}

export interface LeadAnalysisResult {
  leadId: string;
  tier: TierLevel;
  tierLabel: string;
  score: number;

  // Discovered information
  discovered: {
    fullName?: string;
    company?: string;
    role?: string;
    education?: string;
    linkedIn?: string;
    instagram?: string;
    origin?: string;
    wealthEstimate?: string;
  };

  // Arrays
  portfolio: Array<{ company: string; sector: string }>;
  assets: Array<{ name: string; value: string }>;
  alerts: string[];
  highlights: string[];
  sources: string[];

  // Recommendation
  recommendation: {
    action: "avoid" | "priority" | "qualify" | "contact";
    title: string;
    description: string;
  };

  // Analysis metadata
  durationMs: number;
  analysisVersion: string;
}

export class LeadAnalysisService {
  private webSearchService: WebSearchService;
  private domainAnalyzerService: DomainAnalyzerService;
  private riskDetectorService: RiskDetectorService;
  private tierCalculatorService: TierCalculatorService;
  private enableWebSearch: boolean;

  constructor(options?: { enableWebSearch?: boolean }) {
    this.webSearchService = new WebSearchService();
    this.domainAnalyzerService = new DomainAnalyzerService(
      this.webSearchService,
    );
    this.riskDetectorService = new RiskDetectorService(this.webSearchService);
    this.tierCalculatorService = new TierCalculatorService();
    this.enableWebSearch =
      options?.enableWebSearch ?? process.env.ENABLE_LEAD_ANALYSIS !== "false";
  }

  /**
   * Perform deep analysis of a lead
   */
  async analyze(input: LeadAnalysisInput): Promise<LeadAnalysisResult> {
    const startTime = Date.now();
    const sources: string[] = [];
    const portfolio: Array<{ company: string; sector: string }> = [];
    const assets: Array<{ name: string; value: string }> = [];
    const alerts: string[] = [];

    log.info(
      { leadId: input.leadId, name: input.name },
      "Starting lead analysis",
    );

    // 1. Quick risk check (no web search)
    const quickRisk = this.riskDetectorService.quickCheck(input.name);
    if (quickRisk) {
      alerts.push(`${quickRisk.title}: ${quickRisk.description}`);
    }

    // Initialize analysis data
    let domainAnalysis: DomainAnalysis | undefined;
    let personInfo: PersonInfo | undefined;
    let companyInfo: CompanyInfo | undefined;
    let discoveredCompanies: CompanyInfo[] = [];
    let riskAssessment: RiskAssessment | undefined;

    // 2. Analyze email domain
    if (input.email) {
      try {
        domainAnalysis = await this.domainAnalyzerService.analyzeDomain(
          input.email,
        );
        if (domainAnalysis.companyInfo) {
          companyInfo = domainAnalysis.companyInfo;
          sources.push(domainAnalysis.companyInfo.source);

          if (companyInfo.sector) {
            portfolio.push({
              company: companyInfo.name,
              sector: companyInfo.sector,
            });
          }
        }
      } catch (error) {
        log.error({ error, email: input.email }, "Domain analysis failed");
      }
    }

    // 3. Web search (if enabled and quota available)
    if (this.enableWebSearch && this.webSearchService.getQuotaRemaining() > 5) {
      try {
        // Search for person
        const location =
          input.enrichmentData?.addresses?.[0]?.city || "São Paulo";
        personInfo =
          (await this.webSearchService.searchLinkedIn(
            input.name,
            companyInfo?.name,
          )) ?? undefined;

        if (personInfo?.linkedInUrl) {
          sources.push(personInfo.linkedInUrl);
        }

        // Search for companies owned by the person
        discoveredCompanies = await this.webSearchService.searchCompanyByOwner(
          input.name,
        );
        for (const company of discoveredCompanies) {
          sources.push(company.source);
          if (company.sector) {
            portfolio.push({
              company: company.name,
              sector: company.sector,
            });
          }
        }

        // Search for news/risk
        riskAssessment = await this.riskDetectorService.assessRisk(
          input.name,
          input.email,
          input.phone,
          { company: companyInfo?.name },
        );

        for (const alert of riskAssessment.alerts) {
          alerts.push(`${alert.title}`);
          if (alert.source) sources.push(alert.source);
        }
      } catch (error) {
        log.error({ error }, "Web search failed");
      }
    } else if (!this.enableWebSearch) {
      log.debug("Web search disabled");
    } else {
      log.warn("Web search quota exhausted, skipping");
    }

    // 4. Calculate tier
    const tierResult = this.tierCalculatorService.calculate(
      input.name,
      input.phone,
      input.email,
      input.enrichmentData,
      {
        domainAnalysis,
        personInfo,
        companyInfo,
        riskAssessment,
        discoveredCompanies,
      },
    );

    // 5. Build result
    const durationMs = Date.now() - startTime;

    const result: LeadAnalysisResult = {
      leadId: input.leadId,
      tier: tierResult.tier,
      tierLabel: tierResult.tierLabel,
      score: tierResult.score,
      discovered: {
        fullName: personInfo?.fullName,
        company: companyInfo?.name || personInfo?.company,
        role: personInfo?.role || tierResult.factors.role,
        education: personInfo?.education || tierResult.factors.education,
        linkedIn: personInfo?.linkedInUrl,
        origin: tierResult.factors.country,
        wealthEstimate: tierResult.factors.estimatedWealth,
      },
      portfolio,
      assets,
      alerts,
      highlights: tierResult.highlights,
      sources: [...new Set(sources)], // Deduplicate
      recommendation: tierResult.recommendation,
      durationMs,
      analysisVersion: "1.0",
    };

    log.info(
      {
        leadId: input.leadId,
        tier: result.tier,
        score: result.score,
        durationMs,
        sourcesCount: result.sources.length,
        alertsCount: result.alerts.length,
      },
      "Lead analysis completed",
    );

    // 6. Save to database
    await this.saveAnalysis(result);

    return result;
  }

  /**
   * Save analysis result to database
   */
  private async saveAnalysis(result: LeadAnalysisResult): Promise<void> {
    try {
      const db = container.dbStorage.getDb();
      if (!db) {
        log.warn("Database not available, skipping analysis persistence");
        return;
      }

      const record: NewLeadAnalysis = {
        leadId: result.leadId,
        tier: result.tier,
        tierScore: result.score,
        discoveredFullName: result.discovered.fullName,
        discoveredCompany: result.discovered.company,
        discoveredRole: result.discovered.role,
        discoveredEducation: result.discovered.education,
        discoveredLinkedin: result.discovered.linkedIn,
        discoveredOrigin: result.discovered.origin,
        discoveredWealthEstimate: result.discovered.wealthEstimate,
        portfolio: result.portfolio,
        assets: result.assets,
        alerts: result.alerts,
        highlights: result.highlights,
        sources: result.sources,
        recommendationAction: result.recommendation.action,
        recommendationTitle: result.recommendation.title,
        recommendationDescription: result.recommendation.description,
        analysisDurationMs: result.durationMs,
        analysisVersion: result.analysisVersion,
      };

      await db.insert(leadAnalyses).values(record);

      log.debug({ leadId: result.leadId }, "Analysis saved to database");
    } catch (error) {
      log.error(
        { error, leadId: result.leadId },
        "Failed to save analysis to database",
      );
    }
  }

  /**
   * Get analysis for a lead from database
   */
  async getAnalysis(leadId: string): Promise<LeadAnalysisResult | null> {
    try {
      const db = container.dbStorage.getDb();
      if (!db) return null;

      const { eq } = await import("drizzle-orm");
      const results = await db
        .select()
        .from(leadAnalyses)
        .where(eq(leadAnalyses.leadId, leadId))
        .orderBy(leadAnalyses.createdAt)
        .limit(1);

      if (results.length === 0) return null;

      const record = results[0];

      return {
        leadId: record.leadId,
        tier: record.tier as TierLevel,
        tierLabel: this.getTierLabel(record.tier as TierLevel),
        score: record.tierScore,
        discovered: {
          fullName: record.discoveredFullName ?? undefined,
          company: record.discoveredCompany ?? undefined,
          role: record.discoveredRole ?? undefined,
          education: record.discoveredEducation ?? undefined,
          linkedIn: record.discoveredLinkedin ?? undefined,
          origin: record.discoveredOrigin ?? undefined,
          wealthEstimate: record.discoveredWealthEstimate ?? undefined,
        },
        portfolio:
          (record.portfolio as Array<{ company: string; sector: string }>) ||
          [],
        assets: (record.assets as Array<{ name: string; value: string }>) || [],
        alerts: (record.alerts as string[]) || [],
        highlights: (record.highlights as string[]) || [],
        sources: (record.sources as string[]) || [],
        recommendation: {
          action:
            (record.recommendationAction as
              | "avoid"
              | "priority"
              | "qualify"
              | "contact") || "contact",
          title: record.recommendationTitle || "Contatar",
          description: record.recommendationDescription || "",
        },
        durationMs: record.analysisDurationMs || 0,
        analysisVersion: record.analysisVersion || "1.0",
      };
    } catch (error) {
      log.error({ error, leadId }, "Failed to get analysis from database");
      return null;
    }
  }

  /**
   * Check if lead should trigger an alert
   */
  shouldAlert(result: LeadAnalysisResult): {
    shouldAlert: boolean;
    type: "premium" | "risk" | null;
  } {
    if (result.tier === "risk" && result.alerts.length > 0) {
      return { shouldAlert: true, type: "risk" };
    }
    if (result.tier === "platinum" && result.score >= 70) {
      return { shouldAlert: true, type: "premium" };
    }
    return { shouldAlert: false, type: null };
  }

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
}
