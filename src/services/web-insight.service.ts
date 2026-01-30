/**
 * Web Insight Service - Gera insights automáticos sobre leads
 *
 * Analisa leads enriquecidos para descobrir:
 * - Conexões familiares (cônjuge, parentes)
 * - Sobrenomes raros ou de famílias notáveis
 * - Perfil empresarial (via CNPJ lookup)
 * - Leads internacionais
 * - Indicadores de alta renda
 */

import { C2SService } from "./c2s.service";
import { CnpjLookupService, type CompanyInfo } from "./cnpj-lookup.service";
import {
  GoogleSearchService,
  type PersonInsightFromSearch,
} from "./google-search.service";
import {
  analyzeSurname,
  extractSurnames,
  detectFamilyConnection,
  detectConcatenatedName,
  isInternationalPhone,
  calculateLeadScore,
  type SurnameAnalysis,
  type FamilyConnection,
} from "../utils/surname-analyzer";
import {
  formatInsightMessage,
  createFamilyConnectionInsight,
  createRareSurnameInsight,
  createNotableFamilyInsight,
  createHighIncomeInsight,
  createInternationalInsight,
  createMultiplePropertiesInsight,
  createConcatenatedNameInsight,
  createBusinessOwnerInsight,
  createWebSearchInsight,
  type LeadInsight,
  type InsightContext,
} from "../utils/insight-formatter";
import { enrichmentLogger } from "../utils/logger";
import { getConfig } from "../config";

export interface LeadInsightData {
  leadId: string;
  leadName: string;
  enrichedName?: string;
  phone?: string;
  email?: string;
  cpf?: string;
  income?: number;
  presumedIncome?: number;
  propertyCount?: number;
  addresses?: Array<{
    street?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  }>;
  campaignName?: string;
}

export interface InsightResult {
  generated: boolean;
  insightCount: number;
  messageSent: boolean;
  tier?: "platinum" | "gold" | "silver" | "bronze";
  insights?: LeadInsight[];
  error?: string;
}

export class WebInsightService {
  private c2sService: C2SService;
  private cnpjLookupService: CnpjLookupService;
  private googleSearchService: GoogleSearchService;
  private minConfidence: number;
  private enabled: boolean;
  private cnpjLookupEnabled: boolean;
  private googleSearchEnabled: boolean;

  constructor(c2sService?: C2SService) {
    this.c2sService = c2sService || new C2SService();
    this.cnpjLookupService = new CnpjLookupService();
    this.googleSearchService = new GoogleSearchService();
    const config = getConfig();
    this.minConfidence = config.INSIGHT_MIN_CONFIDENCE ?? 60;
    this.enabled = config.ENABLE_WEB_INSIGHTS ?? true;
    this.cnpjLookupEnabled = config.ENABLE_CNPJ_LOOKUP ?? true;
    this.googleSearchEnabled =
      (config.ENABLE_GOOGLE_SEARCH ?? true) &&
      this.googleSearchService.isEnabled();
  }

  /**
   * Gera e envia insights para um lead
   */
  async generateAndSendInsights(
    data: LeadInsightData,
    options?: { sendToC2S?: boolean },
  ): Promise<InsightResult> {
    const shouldSend = options?.sendToC2S ?? true;

    if (!this.enabled) {
      return {
        generated: false,
        insightCount: 0,
        messageSent: false,
        error: "Web insights disabled",
      };
    }

    try {
      // Gerar insights locais (síncronos)
      const insights = this.analyzeLeadForInsights(data);

      // Buscar empresas via CNPJ (assíncrono)
      if (this.cnpjLookupEnabled) {
        const businessInsight = await this.searchBusinessProfile(data);
        if (businessInsight) {
          insights.unshift(businessInsight); // Adiciona no início (mais importante)
        }
      }

      // Buscar informações via Google Search (assíncrono)
      if (this.googleSearchEnabled) {
        const webInsight = await this.searchWebProfile(data);
        if (webInsight) {
          insights.push(webInsight);
        }
      }

      if (insights.length === 0) {
        enrichmentLogger.debug(
          { leadId: data.leadId },
          "No insights generated for lead",
        );
        return {
          generated: false,
          insightCount: 0,
          messageSent: false,
        };
      }

      // Filtrar por confiança mínima
      const qualifiedInsights = insights.filter(
        (i) => i.confidence >= this.minConfidence,
      );

      if (qualifiedInsights.length === 0) {
        enrichmentLogger.debug(
          { leadId: data.leadId, totalInsights: insights.length },
          "No insights meet confidence threshold",
        );
        return {
          generated: true,
          insightCount: insights.length,
          messageSent: false,
          insights,
        };
      }

      // Calcular tier do lead
      const surnameAnalyses = data.enrichedName
        ? extractSurnames(data.enrichedName).map(analyzeSurname)
        : extractSurnames(data.leadName).map(analyzeSurname);

      const familyConnection = data.enrichedName
        ? detectFamilyConnection(data.leadName, data.enrichedName)
        : null;

      const internationalCheck = data.phone
        ? isInternationalPhone(data.phone)
        : { isInternational: false };

      const scoreResult = calculateLeadScore({
        hasRareSurname: surnameAnalyses.some((s) => s.isRare),
        isNotableFamily: surnameAnalyses.some((s) => s.isNotableFamily),
        hasFamilyConnection:
          familyConnection !== null && familyConnection.type !== "none",
        isInternational: internationalCheck.isInternational,
        income: data.income,
        propertyCount: data.propertyCount,
      });

      // Formatar mensagem
      const context: InsightContext = {
        leadName: data.leadName,
        enrichedName: data.enrichedName,
        income: data.income,
        propertyCount: data.propertyCount,
        addresses: data.addresses,
        phone: data.phone,
        tier: scoreResult.tier,
      };

      const message = formatInsightMessage(qualifiedInsights, context);

      if (!shouldSend) {
        return {
          generated: true,
          insightCount: qualifiedInsights.length,
          messageSent: false,
          tier: scoreResult.tier,
          insights: qualifiedInsights,
        };
      }

      // Enviar ao C2S
      try {
        await this.c2sService.createMessage(data.leadId, message);

        enrichmentLogger.info(
          {
            leadId: data.leadId,
            insightCount: qualifiedInsights.length,
            tier: scoreResult.tier,
          },
          "Insight message sent to C2S",
        );

        return {
          generated: true,
          insightCount: qualifiedInsights.length,
          messageSent: true,
          tier: scoreResult.tier,
          insights: qualifiedInsights,
        };
      } catch (error) {
        enrichmentLogger.error(
          { leadId: data.leadId, error },
          "Failed to send insight message to C2S",
        );

        return {
          generated: true,
          insightCount: qualifiedInsights.length,
          messageSent: false,
          tier: scoreResult.tier,
          insights: qualifiedInsights,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    } catch (error) {
      enrichmentLogger.error(
        { leadId: data.leadId, error },
        "Failed to generate insights",
      );

      return {
        generated: false,
        insightCount: 0,
        messageSent: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Analisa um lead e retorna lista de insights
   */
  analyzeLeadForInsights(data: LeadInsightData): LeadInsight[] {
    const insights: LeadInsight[] = [];

    // 1. Análise de nome concatenado (ex: "Martarabello")
    const concatenatedCheck = detectConcatenatedName(data.leadName);
    if (
      concatenatedCheck.detected &&
      concatenatedCheck.firstName &&
      concatenatedCheck.lastName
    ) {
      insights.push(
        createConcatenatedNameInsight(
          data.leadName,
          concatenatedCheck.firstName,
          concatenatedCheck.lastName,
        ),
      );
    }

    // 2. Análise de conexão familiar (nome do lead vs CPF encontrado)
    if (data.enrichedName && data.enrichedName !== data.leadName) {
      const familyConnection = detectFamilyConnection(
        data.leadName,
        data.enrichedName,
      );

      if (familyConnection.type !== "none" && familyConnection.sharedSurname) {
        let relationshipText = "Familiar";
        if (familyConnection.type === "spouse") {
          relationshipText = "Provável cônjuge";
        } else if (familyConnection.type === "sibling") {
          relationshipText = "Possível irmão(ã)";
        } else if (familyConnection.type === "parent_child") {
          relationshipText = "Possível pai/mãe ou filho(a)";
        }

        insights.push(
          createFamilyConnectionInsight(
            data.leadName,
            data.enrichedName,
            relationshipText,
            familyConnection.sharedSurname,
          ),
        );
      }
    }

    // 3. Análise de sobrenomes (raro ou família notável)
    const nameToAnalyze = data.enrichedName || data.leadName;
    const surnames = extractSurnames(nameToAnalyze);

    for (const surname of surnames) {
      const analysis = analyzeSurname(surname);

      if (
        analysis.isNotableFamily &&
        analysis.familyContext &&
        analysis.relatedPeople
      ) {
        insights.push(
          createNotableFamilyInsight(
            surname,
            analysis.familyContext,
            analysis.relatedPeople,
          ),
        );
      } else if (analysis.isRare && analysis.confidence >= 70) {
        insights.push(createRareSurnameInsight(surname));
      }
    }

    // 4. Análise de alta renda
    if (data.income && data.income >= 10000) {
      insights.push(createHighIncomeInsight(data.income, data.presumedIncome));
    }

    // 5. Análise de lead internacional
    if (data.phone) {
      const internationalCheck = isInternationalPhone(data.phone);
      if (internationalCheck.isInternational && internationalCheck.country) {
        insights.push(
          createInternationalInsight(internationalCheck.country, data.phone),
        );
      }
    }

    // 6. Análise de múltiplas propriedades
    if (data.propertyCount && data.propertyCount >= 3) {
      insights.push(createMultiplePropertiesInsight(data.propertyCount));
    }

    return insights;
  }

  /**
   * Verifica se deve gerar insights para um lead
   */
  shouldGenerateInsights(data: LeadInsightData): boolean {
    if (!this.enabled) return false;

    // Sempre gerar se tiver nome diferente (possível família)
    if (data.enrichedName && data.enrichedName !== data.leadName) {
      return true;
    }

    // Gerar se tiver alta renda
    if (data.income && data.income >= 10000) {
      return true;
    }

    // Gerar se tiver múltiplas propriedades
    if (data.propertyCount && data.propertyCount >= 3) {
      return true;
    }

    // Gerar se for internacional
    if (data.phone) {
      const check = isInternationalPhone(data.phone);
      if (check.isInternational) return true;
    }

    // Gerar se tiver sobrenome raro ou notável
    const nameToCheck = data.enrichedName || data.leadName;
    const surnames = extractSurnames(nameToCheck);
    for (const surname of surnames) {
      const analysis = analyzeSurname(surname);
      if (
        analysis.isNotableFamily ||
        (analysis.isRare && analysis.confidence >= 70)
      ) {
        return true;
      }
    }

    // Verificar nome concatenado
    const concatenatedCheck = detectConcatenatedName(data.leadName);
    if (concatenatedCheck.detected && concatenatedCheck.confidence >= 70) {
      return true;
    }

    return false;
  }

  /**
   * Busca perfil empresarial via CNPJ lookup
   * Procura empresas onde a pessoa é sócia/administradora
   */
  private async searchBusinessProfile(
    data: LeadInsightData,
  ): Promise<LeadInsight | null> {
    const nameToSearch = data.enrichedName || data.leadName;

    try {
      enrichmentLogger.debug(
        { leadId: data.leadId, name: nameToSearch },
        "Searching business profile via CNPJ",
      );

      const result =
        await this.cnpjLookupService.searchCompaniesByName(nameToSearch);

      if (!result.success || result.companies.length === 0) {
        enrichmentLogger.debug(
          { leadId: data.leadId, name: nameToSearch },
          "No companies found for lead",
        );
        return null;
      }

      // Filtrar apenas empresas ativas
      const activeCompanies = result.companies.filter(
        (c) => c.situacao?.toUpperCase() === "ATIVA",
      );

      if (activeCompanies.length === 0) {
        enrichmentLogger.debug(
          { leadId: data.leadId, totalCompanies: result.companies.length },
          "No active companies found",
        );
        return null;
      }

      // Criar insight de empresário
      const companiesForInsight = activeCompanies.slice(0, 5).map((c) => ({
        name: c.nomeFantasia || c.razaoSocial,
        role: this.findRole(c, nameToSearch),
        capital: c.capitalSocial,
      }));

      enrichmentLogger.info(
        {
          leadId: data.leadId,
          name: nameToSearch,
          companiesFound: activeCompanies.length,
          source: result.source,
        },
        "Business profile found",
      );

      return createBusinessOwnerInsight(nameToSearch, companiesForInsight);
    } catch (error) {
      enrichmentLogger.error(
        { leadId: data.leadId, name: nameToSearch, error },
        "Failed to search business profile",
      );
      return null;
    }
  }

  /**
   * Encontra o papel da pessoa na empresa
   */
  private findRole(
    company: CompanyInfo,
    personName: string,
  ): string | undefined {
    if (!company.socios) return undefined;

    const normalizedName = personName.toUpperCase();
    const socio = company.socios.find(
      (s) =>
        s.nome?.toUpperCase().includes(normalizedName) ||
        normalizedName.includes(s.nome?.toUpperCase() || ""),
    );

    return socio?.qualificacao;
  }

  /**
   * Busca perfil web via Google Search
   * Procura LinkedIn, notícias, menções legais
   */
  private async searchWebProfile(
    data: LeadInsightData,
  ): Promise<LeadInsight | null> {
    const nameToSearch = data.enrichedName || data.leadName;

    try {
      enrichmentLogger.debug(
        {
          leadId: data.leadId,
          name: nameToSearch,
          quota: this.googleSearchService.getRemainingQuota(),
        },
        "Searching web profile via Google",
      );

      const personInsights =
        await this.googleSearchService.searchPerson(nameToSearch);

      // Verifica se encontrou algo relevante
      const hasRelevantData =
        personInsights.linkedinProfile ||
        (personInsights.companies && personInsights.companies.length > 0) ||
        (personInsights.newsArticles &&
          personInsights.newsArticles.length > 0) ||
        (personInsights.legalMentions &&
          personInsights.legalMentions.length > 0);

      if (!hasRelevantData) {
        enrichmentLogger.debug(
          { leadId: data.leadId, name: nameToSearch },
          "No relevant web profile found",
        );
        return null;
      }

      enrichmentLogger.info(
        {
          leadId: data.leadId,
          name: nameToSearch,
          hasLinkedIn: !!personInsights.linkedinProfile,
          companiesFound: personInsights.companies?.length || 0,
          newsFound: personInsights.newsArticles?.length || 0,
        },
        "Web profile found",
      );

      return createWebSearchInsight(
        personInsights.linkedinProfile,
        personInsights.companies,
        personInsights.newsArticles,
        personInsights.legalMentions,
        personInsights.summary,
      );
    } catch (error) {
      enrichmentLogger.error(
        { leadId: data.leadId, name: nameToSearch, error },
        "Failed to search web profile",
      );
      return null;
    }
  }
}
