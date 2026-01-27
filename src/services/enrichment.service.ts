import {
  WorkApiService,
  type WorkApiPerson,
  type WorkApiFetchResult,
} from "./work-api.service";
import {
  CpfDiscoveryService,
  type CpfDiscoveryResult,
} from "./cpf-discovery.service";
import { C2SService, type C2SLeadCreate } from "./c2s.service";
import { DbStorageService } from "./db-storage.service";
import {
  IbviPropertyService,
  type PropertySummary,
} from "./ibvi-property.service";
import { WebInsightService, type LeadInsightData } from "./web-insight.service";
import { PrometheusService } from "./prometheus.service";
import { recentCpfCache, processingLeadsCache } from "../utils/cache";
import {
  normalizeIncome,
  normalizeName,
  normalizeEmail,
  normalizeCpf,
} from "../utils/normalize";
import { normalizePhone, formatPhoneWithCountryCode } from "../utils/phone";
import {
  buildDescription,
  buildSimpleDescription,
  buildPartialEnrichmentDescription,
} from "../utils/description-builder";
import { enrichmentLogger } from "../utils/logger";
import { getConfig } from "../config";
import type { NewParty, NewPartyContact, NewAddress } from "../db/schema";
import { container } from "../container";
import { detectHighValueLead } from "../utils/high-value-detector";
import { alertService } from "./alert.service";
import type {
  LeadAnalysisService,
  LeadAnalysisResult,
} from "./lead-analysis.service";

export interface LeadData {
  leadId: string;
  name: string;
  phone?: string;
  email?: string;
  campaignId?: string;
  campaignName?: string;
  source?: string;
  rawData?: Record<string, unknown>;
}

export interface EnrichmentResult {
  success: boolean;
  cpf?: string;
  c2sCustomerId?: string;
  partyId?: string;
  enriched: boolean;
  partialEnrichment?: boolean; // True when Work API timed out
  message: string;
}

/**
 * Main enrichment orchestrator
 * Handles the full lead enrichment pipeline:
 * 1. Prevent duplicate processing
 * 2. Discover CPF from phone/email
 * 3. Fetch enrichment data from Work API
 * 4. Store party data in database
 * 5. Create/update customer in C2S
 */
export class EnrichmentService {
  private workApiService: WorkApiService;
  private cpfDiscoveryService: CpfDiscoveryService;
  private c2sService: C2SService;
  private dbStorage: DbStorageService;
  private ibviPropertyService: IbviPropertyService;
  private webInsightService: WebInsightService;
  private incomeMultiplier: number;
  private enableWebInsights: boolean;
  private enableLeadAnalysis: boolean;

  constructor() {
    this.workApiService = new WorkApiService();
    this.cpfDiscoveryService = new CpfDiscoveryService();
    this.c2sService = new C2SService();
    this.dbStorage = new DbStorageService();
    this.ibviPropertyService = new IbviPropertyService();
    this.webInsightService = new WebInsightService(this.c2sService);
    const config = getConfig();
    this.incomeMultiplier = config.INCOME_MULTIPLIER;
    this.enableWebInsights = config.ENABLE_WEB_INSIGHTS ?? true;
    this.enableLeadAnalysis = config.ENABLE_LEAD_ANALYSIS ?? true;
  }

  async enrichLead(lead: LeadData): Promise<EnrichmentResult> {
    const { leadId, name, phone, email, campaignName } = lead;
    const startTime = Date.now();

    enrichmentLogger.info(
      { leadId, name, phone, email },
      "Starting lead enrichment",
    );

    // Check if already processing this lead
    if (!(await processingLeadsCache.setNx(leadId, true))) {
      enrichmentLogger.warn({ leadId }, "Lead is already being processed");
      return {
        success: false,
        enriched: false,
        message: "Lead is already being processed",
      };
    }

    try {
      // Step 1: Discover CPF
      const normalizedPhone = phone ? normalizePhone(phone) : undefined;
      const normalizedEmail = email ? normalizeEmail(email) : undefined;

      const cpfResult = await this.cpfDiscoveryService.findCpf(
        normalizedPhone,
        normalizedEmail ?? undefined,
        name, // RML-595: Pass lead name for smart matching
      );

      if (!cpfResult) {
        enrichmentLogger.info(
          { leadId },
          "Could not discover CPF, creating unenriched customer",
        );
        const result = await this.createUnenrichedCustomer(lead);
        const durationSeconds = (Date.now() - startTime) / 1000;
        container.prometheus.recordEnrichment("unenriched", durationSeconds);
        return result;
      }

      const { cpf, foundName, nameMatches } = cpfResult;

      // Check if CPF was recently processed
      if (recentCpfCache.has(cpf)) {
        enrichmentLogger.info(
          { leadId, cpf },
          "CPF was recently processed, skipping",
        );
        return {
          success: true,
          cpf,
          enriched: false,
          message: "CPF was recently processed",
        };
      }

      // Step 2: Fetch enrichment data from Work API (with timeout handling)
      // Also fetch property data from IBVI database in parallel (RML-596)
      const [workApiResult, propertyData] = await Promise.all([
        this.workApiService.fetchByCpfWithTimeout(cpf),
        this.ibviPropertyService.findPropertiesByCpf(cpf).catch((err) => {
          enrichmentLogger.warn(
            { cpf, error: err },
            "Failed to fetch IBVI property data",
          );
          return null;
        }),
      ]);

      // Build name mismatch warning if applicable
      const nameMismatchWarning = !nameMatches
        ? `⚠️ Nome diferente do Lead: ${name}\n\n`
        : "";

      // Handle Work API timeout - proceed with partial enrichment
      if (workApiResult.timedOut) {
        enrichmentLogger.warn(
          { leadId, cpf },
          "Work API timed out, creating partial enrichment customer",
        );
        const result = await this.createPartialEnrichmentCustomer(
          lead,
          cpf,
          propertyData,
          nameMismatchWarning,
        );
        const durationSeconds = (Date.now() - startTime) / 1000;
        container.prometheus.recordEnrichment("partial", durationSeconds);
        return result;
      }

      if (!workApiResult.data) {
        enrichmentLogger.info(
          { leadId, cpf },
          "No enrichment data found, creating basic customer",
        );
        return this.createBasicCustomer(
          lead,
          cpf,
          propertyData,
          nameMismatchWarning,
        );
      }

      const personData = workApiResult.data;

      // Step 3: Store in database
      const party = await this.storePartyData(personData, cpf);

      // Step 4: Create/update C2S customer (with property data - RML-596)
      const c2sResult = await this.createEnrichedCustomer(
        lead,
        personData,
        propertyData,
        nameMismatchWarning,
      );

      // Mark CPF as recently processed
      recentCpfCache.set(cpf, true);

      // Update lead status with contact data
      await this.dbStorage.updateLeadEnrichmentStatus(
        leadId,
        "completed",
        party.id,
        c2sResult.data.id,
        { name, phone, email, campaignName },
      );

      enrichmentLogger.info(
        { leadId, cpf, c2sCustomerId: c2sResult.data.id },
        "Lead enrichment completed",
      );

      // Record metrics
      const durationSeconds = (Date.now() - startTime) / 1000;
      container.prometheus.recordEnrichment("completed", durationSeconds);

      // Generate insights message (cleaned up version - no duplicates)
      if (this.enableWebInsights) {
        this.generateInsightsAsync(
          leadId,
          name,
          personData,
          propertyData,
          phone,
          email,
          campaignName,
        );
      }

      // Check for high-value lead and alert (RML-810)
      this.checkHighValueLeadAsync(
        leadId,
        name,
        personData,
        phone,
        email,
        c2sResult.data.id,
      );

      // Run deep lead analysis (RML-872)
      if (this.enableLeadAnalysis) {
        this.runDeepAnalysisAsync(
          leadId,
          name,
          email,
          phone,
          personData,
          propertyData,
        );
      }

      return {
        success: true,
        cpf,
        c2sCustomerId: c2sResult.data.id,
        partyId: party.id,
        enriched: true,
        message: "Lead enriched successfully",
      };
    } catch (error) {
      enrichmentLogger.error({ leadId, error }, "Lead enrichment failed");

      // Record failure metrics
      const durationSeconds = (Date.now() - startTime) / 1000;
      container.prometheus.recordEnrichment("error", durationSeconds);

      return {
        success: false,
        enriched: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      // Remove from processing cache
      await processingLeadsCache.delete(leadId);
    }
  }

  private async storePartyData(
    person: WorkApiPerson,
    cpf: string,
  ): Promise<{ id: string }> {
    // Create/update party
    // Normalize gender: Work API returns "M - MASCULINO" or "F - FEMININO"
    // Extract just the first character (M or F) to fit varchar(10)
    const normalizedGender = person.sexo ? person.sexo.charAt(0) : undefined;

    const partyData: NewParty = {
      type: "person",
      cpfCnpj: normalizeCpf(cpf),
      name: normalizeName(person.nome),
      gender: normalizedGender,
      motherName: person.nomeMae,
      income: normalizeIncome(person.renda, this.incomeMultiplier)?.toString(),
      netWorth: person.patrimonio?.toString(),
      occupation: person.profissao,
      educationLevel: person.escolaridade,
      maritalStatus: person.estadoCivil,
    };

    if (person.dataNascimento) {
      // Work API returns dates in DD/MM/YYYY format (Brazilian)
      // Convert to YYYY-MM-DD for proper Date parsing
      const parts = person.dataNascimento.split("/");
      if (parts.length === 3) {
        const [day, month, year] = parts;
        partyData.birthDate = new Date(`${year}-${month}-${day}`);
      }
    }

    const party = await this.dbStorage.upsertParty(partyData);

    // Store contacts
    if (person.telefones) {
      for (const tel of person.telefones) {
        const contact: NewPartyContact = {
          partyId: party.id,
          type: tel.tipo || "phone",
          value: formatPhoneWithCountryCode(tel.numero),
        };
        await this.dbStorage.upsertContact(contact);
      }
    }

    if (person.emails) {
      for (const email of person.emails) {
        const contact: NewPartyContact = {
          partyId: party.id,
          type: "email",
          value: email.email.toLowerCase(),
        };
        await this.dbStorage.upsertContact(contact);
      }
    }

    // Store addresses
    if (person.enderecos) {
      for (const addr of person.enderecos) {
        const address: NewAddress = {
          partyId: party.id,
          street: addr.logradouro,
          number: addr.numero,
          complement: addr.complemento,
          neighborhood: addr.bairro,
          city: addr.cidade,
          state: addr.uf,
          zipCode: addr.cep,
        };
        await this.dbStorage.upsertAddress(address);
      }
    }

    return party;
  }

  private async createEnrichedCustomer(
    lead: LeadData,
    person: WorkApiPerson,
    propertyData: PropertySummary | null,
    nameMismatchWarning: string = "",
  ): Promise<{ data: { id: string } }> {
    let description =
      nameMismatchWarning + buildDescription(person, lead.campaignName);

    // Append property data if available (RML-596)
    if (propertyData && propertyData.totalProperties > 0) {
      const propertySection =
        this.ibviPropertyService.formatForMessage(propertyData);
      if (propertySection) {
        description += "\n\n" + propertySection;
      }
    }

    // Try adding enrichment message to existing lead first
    try {
      await this.c2sService.createMessage(lead.leadId, description);
      enrichmentLogger.info(
        { leadId: lead.leadId },
        "Added enrichment message to existing C2S lead",
      );
      return { data: { id: lead.leadId } };
    } catch {
      // If message fails, try creating new lead
      enrichmentLogger.warn(
        { leadId: lead.leadId },
        "Failed to add message to existing lead, creating new lead",
      );

      const leadData: C2SLeadCreate = {
        customer: normalizeName(person.nome) || lead.name,
        phone: lead.phone ? formatPhoneWithCountryCode(lead.phone) : undefined,
        email: lead.email
          ? (normalizeEmail(lead.email) ?? undefined)
          : undefined,
        description,
        source: lead.source || "google_ads",
        product: lead.campaignName,
      };

      return this.c2sService.createLead(leadData);
    }
  }

  private async createUnenrichedCustomer(
    lead: LeadData,
  ): Promise<EnrichmentResult> {
    // RML-811: Skip sending message if name is "Unknown" or empty
    // This prevents duplicate "Nome: Unknown" messages in C2S
    const normalizedName = normalizeName(lead.name);
    const isUnknownName =
      !normalizedName ||
      normalizedName.toLowerCase() === "unknown" ||
      normalizedName.toLowerCase() === "desconhecido";

    if (isUnknownName) {
      enrichmentLogger.info(
        { leadId: lead.leadId, name: lead.name },
        "Skipping unenriched message - name is Unknown/empty",
      );

      // Still update status but don't send message - save contact data
      await this.dbStorage.updateLeadEnrichmentStatus(
        lead.leadId,
        "unenriched",
        undefined,
        lead.leadId,
        {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          campaignName: lead.campaignName,
        },
      );

      return {
        success: true,
        c2sCustomerId: lead.leadId,
        enriched: false,
        message: "Skipped message - name is Unknown (CPF not found)",
      };
    }

    const description = buildSimpleDescription(
      lead.name,
      lead.phone,
      lead.email,
      lead.campaignName,
    );

    // Try adding message to existing lead first
    try {
      await this.c2sService.createMessage(lead.leadId, description);

      await this.dbStorage.updateLeadEnrichmentStatus(
        lead.leadId,
        "unenriched",
        undefined,
        lead.leadId,
        {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          campaignName: lead.campaignName,
        },
      );

      return {
        success: true,
        c2sCustomerId: lead.leadId,
        enriched: false,
        message: "Added note to existing lead (CPF not found)",
      };
    } catch {
      // If message fails, try creating new lead
      const leadData: C2SLeadCreate = {
        customer: normalizedName || lead.name,
        phone: lead.phone ? formatPhoneWithCountryCode(lead.phone) : undefined,
        email: lead.email
          ? (normalizeEmail(lead.email) ?? undefined)
          : undefined,
        description,
        source: lead.source || "google_ads",
        product: lead.campaignName,
      };

      const result = await this.c2sService.createLead(leadData);

      await this.dbStorage.updateLeadEnrichmentStatus(
        lead.leadId,
        "unenriched",
        undefined,
        result.data.id,
        {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          campaignName: lead.campaignName,
        },
      );

      return {
        success: true,
        c2sCustomerId: result.data.id,
        enriched: false,
        message: "Customer created without enrichment (CPF not found)",
      };
    }
  }

  private async createBasicCustomer(
    lead: LeadData,
    cpf: string,
    propertyData: PropertySummary | null,
    nameMismatchWarning: string = "",
  ): Promise<EnrichmentResult> {
    // RML-811: Skip sending message if name is "Unknown" or empty
    const normalizedName = normalizeName(lead.name);
    const isUnknownName =
      !normalizedName ||
      normalizedName.toLowerCase() === "unknown" ||
      normalizedName.toLowerCase() === "desconhecido";

    if (isUnknownName) {
      enrichmentLogger.info(
        { leadId: lead.leadId, cpf, name: lead.name },
        "Skipping basic message - name is Unknown/empty",
      );

      recentCpfCache.set(cpf, true);

      await this.dbStorage.updateLeadEnrichmentStatus(
        lead.leadId,
        "basic",
        undefined,
        lead.leadId,
        {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          campaignName: lead.campaignName,
        },
      );

      return {
        success: true,
        cpf,
        c2sCustomerId: lead.leadId,
        enriched: false,
        message:
          "Skipped message - name is Unknown (CPF found but no Work API data)",
      };
    }

    let description =
      nameMismatchWarning +
      buildSimpleDescription(
        lead.name,
        lead.phone,
        lead.email,
        lead.campaignName,
      );

    // Append property data if available (RML-596)
    if (propertyData && propertyData.totalProperties > 0) {
      const propertySection =
        this.ibviPropertyService.formatForMessage(propertyData);
      if (propertySection) {
        description += "\n\n" + propertySection;
      }
    }

    // Try adding message to existing lead first
    try {
      await this.c2sService.createMessage(lead.leadId, description);

      // Mark CPF as recently processed
      recentCpfCache.set(cpf, true);

      await this.dbStorage.updateLeadEnrichmentStatus(
        lead.leadId,
        "basic",
        undefined,
        lead.leadId,
        {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          campaignName: lead.campaignName,
        },
      );

      return {
        success: true,
        cpf,
        c2sCustomerId: lead.leadId,
        enriched: false,
        message: "Added basic enrichment to existing lead (no Work API data)",
      };
    } catch {
      // If message fails, try creating new lead
      const leadData: C2SLeadCreate = {
        customer: normalizeName(lead.name) || lead.name,
        phone: lead.phone ? formatPhoneWithCountryCode(lead.phone) : undefined,
        email: lead.email
          ? (normalizeEmail(lead.email) ?? undefined)
          : undefined,
        description,
        source: lead.source || "google_ads",
        product: lead.campaignName,
      };

      const result = await this.c2sService.createLead(leadData);

      // Mark CPF as recently processed
      recentCpfCache.set(cpf, true);

      await this.dbStorage.updateLeadEnrichmentStatus(
        lead.leadId,
        "basic",
        undefined,
        result.data.id,
        {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          campaignName: lead.campaignName,
        },
      );

      return {
        success: true,
        cpf,
        c2sCustomerId: result.data.id,
        enriched: false,
        message: "Customer created with CPF but no enrichment data",
      };
    }
  }

  /**
   * Create customer with partial enrichment when Work API times out
   * CPF was discovered but enrichment data couldn't be fetched in time
   * Reference: Lead Operations Guide - "partial fallback" pattern
   */
  private async createPartialEnrichmentCustomer(
    lead: LeadData,
    cpf: string,
    propertyData: PropertySummary | null,
    nameMismatchWarning: string = "",
  ): Promise<EnrichmentResult> {
    let description =
      nameMismatchWarning +
      buildPartialEnrichmentDescription(
        lead.name,
        cpf,
        lead.phone,
        lead.email,
        lead.campaignName,
      );

    // Append property data if available (RML-596)
    if (propertyData && propertyData.totalProperties > 0) {
      const propertySection =
        this.ibviPropertyService.formatForMessage(propertyData);
      if (propertySection) {
        description += "\n\n" + propertySection;
      }
    }

    // For existing C2S leads (like from the last 25), add a message instead of creating new
    // The leadId from C2S is the actual C2S lead ID
    try {
      await this.c2sService.createMessage(lead.leadId, description);

      enrichmentLogger.info(
        { leadId: lead.leadId, cpf },
        "Added partial enrichment message to existing C2S lead",
      );

      await this.dbStorage.updateLeadEnrichmentStatus(
        lead.leadId,
        "partial",
        undefined,
        lead.leadId,
        {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          campaignName: lead.campaignName,
        },
      );

      return {
        success: true,
        cpf,
        c2sCustomerId: lead.leadId,
        enriched: false,
        partialEnrichment: true,
        message:
          "Added partial enrichment to existing lead (Work API unavailable)",
      };
    } catch {
      // If adding message fails, try creating new lead
      enrichmentLogger.warn(
        { leadId: lead.leadId },
        "Failed to add message, attempting to create new lead",
      );

      const leadData: C2SLeadCreate = {
        customer: normalizeName(lead.name) || lead.name,
        phone: lead.phone ? formatPhoneWithCountryCode(lead.phone) : undefined,
        email: lead.email
          ? (normalizeEmail(lead.email) ?? undefined)
          : undefined,
        description,
        source: lead.source || "google_ads",
        product: lead.campaignName,
      };

      const result = await this.c2sService.createLead(leadData);

      await this.dbStorage.updateLeadEnrichmentStatus(
        lead.leadId,
        "partial",
        undefined,
        result.data.id,
        {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          campaignName: lead.campaignName,
        },
      );

      enrichmentLogger.info(
        { leadId: lead.leadId, cpf, c2sCustomerId: result.data.id },
        "Created partial enrichment customer (Work API timeout)",
      );

      return {
        success: true,
        cpf,
        c2sCustomerId: result.data.id,
        enriched: false,
        partialEnrichment: true,
        message: "Customer created with partial enrichment (Work API timeout)",
      };
    }
  }

  /**
   * Generate and send insights asynchronously (doesn't block enrichment)
   * This runs in the background after enrichment is complete
   */
  private generateInsightsAsync(
    leadId: string,
    leadName: string,
    personData: WorkApiPerson,
    propertyData: PropertySummary | null,
    phone?: string,
    email?: string,
    campaignName?: string,
  ): void {
    // Run async without blocking
    (async () => {
      try {
        const insightData: LeadInsightData = {
          leadId,
          leadName,
          enrichedName: personData.nome,
          phone,
          email,
          cpf: personData.cpf,
          income:
            normalizeIncome(personData.renda, this.incomeMultiplier) ??
            undefined,
          presumedIncome: personData.rendaPresumida
            ? (normalizeIncome(
                personData.rendaPresumida,
                this.incomeMultiplier,
              ) ?? undefined)
            : undefined,
          propertyCount: propertyData?.totalProperties ?? 0,
          addresses: personData.enderecos?.map((e) => ({
            street: e.logradouro,
            neighborhood: e.bairro,
            city: e.cidade,
            state: e.uf,
          })),
          campaignName,
        };

        // Check if insights should be generated
        if (!this.webInsightService.shouldGenerateInsights(insightData)) {
          enrichmentLogger.debug(
            { leadId },
            "No significant insights to generate for lead",
          );
          return;
        }

        // Generate and send insights
        const result =
          await this.webInsightService.generateAndSendInsights(insightData);

        if (result.messageSent) {
          enrichmentLogger.info(
            { leadId, insightCount: result.insightCount, tier: result.tier },
            "Insights sent to C2S",
          );
        } else if (result.generated) {
          enrichmentLogger.debug(
            { leadId, insightCount: result.insightCount },
            "Insights generated but not sent (low confidence or error)",
          );
        }
      } catch (error) {
        enrichmentLogger.error(
          { leadId, error },
          "Failed to generate insights (non-blocking)",
        );
      }
    })();
  }

  /**
   * Check if lead is high-value and send alert (RML-810)
   * Runs asynchronously - doesn't block enrichment response
   */
  private checkHighValueLeadAsync(
    leadId: string,
    leadName: string,
    personData: WorkApiPerson,
    phone?: string,
    email?: string,
    c2sCustomerId?: string,
  ): void {
    // Run async without blocking
    (async () => {
      try {
        // Build criteria from person data
        const addresses = personData.enderecos?.map((addr) => ({
          neighborhood: addr.bairro,
          city: addr.cidade,
          state: addr.uf,
        }));

        const result = detectHighValueLead({
          income:
            normalizeIncome(personData.renda, this.incomeMultiplier) ??
            undefined,
          presumedIncome: personData.rendaPresumida
            ? (normalizeIncome(
                personData.rendaPresumida,
                this.incomeMultiplier,
              ) ?? undefined)
            : undefined,
          addresses,
          leadName,
          enrichedName: personData.nome,
          // companyCount would come from CNPJ lookup - future enhancement
        });

        // Only alert for truly high-value leads (Gold+ tier, score >= 50)
        if (result.isHighValue) {
          enrichmentLogger.info(
            {
              leadId,
              tier: result.tier,
              score: result.score,
              reasons: result.reasons,
              details: result.details,
            },
            "High-value lead detected!",
          );

          // Build C2S URL for quick access
          const config = getConfig();
          const c2sUrl = c2sCustomerId
            ? `${config.C2S_URL}/leads/${c2sCustomerId}`
            : undefined;

          // Send alert via Slack + Email
          await alertService.alertHighValueLead({
            leadId,
            name: personData.nome || leadName,
            phone: phone ? formatPhoneWithCountryCode(phone) : undefined,
            email,
            income: result.details.income,
            neighborhood: result.details.neighborhood,
            companies: result.details.companies,
            familyName: result.details.familyName,
            reasons: result.reasons,
            tier: result.tier,
            score: result.score,
            c2sUrl,
          });
        } else if (result.tier === "silver") {
          // Log silver leads but don't alert
          enrichmentLogger.debug(
            {
              leadId,
              tier: result.tier,
              score: result.score,
              reasons: result.reasons,
            },
            "Potential lead detected (silver tier - no alert)",
          );
        }
      } catch (error) {
        enrichmentLogger.error(
          { leadId, error },
          "Failed to check high-value lead (non-blocking)",
        );
      }
    })();
  }

  /**
   * Run deep lead analysis asynchronously (RML-872)
   * Performs web searches, domain analysis, risk detection, and tier calculation
   * Runs in background - doesn't block enrichment response
   */
  private runDeepAnalysisAsync(
    leadId: string,
    name: string,
    email?: string,
    phone?: string,
    personData?: WorkApiPerson,
    propertyData?: PropertySummary | null,
  ): void {
    // Run async without blocking
    (async () => {
      try {
        const leadAnalysisService = container.leadAnalysis;

        // Build enrichment data for analysis
        const enrichmentData = personData
          ? {
              income:
                normalizeIncome(personData.renda, this.incomeMultiplier) ??
                undefined,
              addresses: personData.enderecos?.map((addr) => ({
                neighborhood: addr.bairro,
                city: addr.cidade,
                state: addr.uf,
              })),
              propertyCount: propertyData?.totalProperties ?? 0,
              cpf: personData.cpf,
            }
          : undefined;

        const analysisResult = await leadAnalysisService.analyze({
          leadId,
          name,
          email,
          phone,
          enrichmentData,
        });

        enrichmentLogger.info(
          {
            leadId,
            tier: analysisResult.tier,
            score: analysisResult.score,
            durationMs: analysisResult.durationMs,
            alertsCount: analysisResult.alerts.length,
          },
          "Deep lead analysis completed",
        );

        // Check if we should send alerts
        const alertCheck = leadAnalysisService.shouldAlert(analysisResult);
        if (alertCheck.shouldAlert) {
          if (alertCheck.type === "risk") {
            // Send risk alert
            await alertService.sendAlert("lead_risk_detected", {
              leadId,
              name,
              tier: analysisResult.tier,
              score: analysisResult.score,
              alerts: analysisResult.alerts,
              recommendation: analysisResult.recommendation.title,
            });
          } else if (alertCheck.type === "premium") {
            // Send premium lead alert (complement to high-value detection)
            enrichmentLogger.info(
              { leadId, tier: analysisResult.tier },
              "Premium lead detected via deep analysis",
            );
          }
        }
      } catch (error) {
        enrichmentLogger.error(
          { leadId, error },
          "Failed to run deep lead analysis (non-blocking)",
        );
      }
    })();
  }
}
