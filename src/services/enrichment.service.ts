import {
  WorkApiService,
  type WorkApiPerson,
  type WorkApiFetchResult,
} from "./work-api.service";
import { CpfDiscoveryService } from "./cpf-discovery.service";
import { C2SService, type C2SLeadCreate } from "./c2s.service";
import { DbStorageService } from "./db-storage.service";
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
  private incomeMultiplier: number;

  constructor() {
    this.workApiService = new WorkApiService();
    this.cpfDiscoveryService = new CpfDiscoveryService();
    this.c2sService = new C2SService();
    this.dbStorage = new DbStorageService();
    this.incomeMultiplier = getConfig().INCOME_MULTIPLIER;
  }

  async enrichLead(lead: LeadData): Promise<EnrichmentResult> {
    const { leadId, name, phone, email, campaignName } = lead;

    enrichmentLogger.info(
      { leadId, name, phone, email },
      "Starting lead enrichment",
    );

    // Check if already processing this lead
    if (processingLeadsCache.has(leadId)) {
      enrichmentLogger.warn({ leadId }, "Lead is already being processed");
      return {
        success: false,
        enriched: false,
        message: "Lead is already being processed",
      };
    }

    // Mark as processing
    processingLeadsCache.set(leadId, true);

    try {
      // Step 1: Discover CPF
      const normalizedPhone = phone ? normalizePhone(phone) : undefined;
      const normalizedEmail = email ? normalizeEmail(email) : undefined;

      const cpf = await this.cpfDiscoveryService.findCpf(
        normalizedPhone,
        normalizedEmail ?? undefined,
      );

      if (!cpf) {
        enrichmentLogger.info(
          { leadId },
          "Could not discover CPF, creating unenriched customer",
        );
        return this.createUnenrichedCustomer(lead);
      }

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
      const workApiResult =
        await this.workApiService.fetchByCpfWithTimeout(cpf);

      // Handle Work API timeout - proceed with partial enrichment
      if (workApiResult.timedOut) {
        enrichmentLogger.warn(
          { leadId, cpf },
          "Work API timed out, creating partial enrichment customer",
        );
        return this.createPartialEnrichmentCustomer(lead, cpf);
      }

      if (!workApiResult.data) {
        enrichmentLogger.info(
          { leadId, cpf },
          "No enrichment data found, creating basic customer",
        );
        return this.createBasicCustomer(lead, cpf);
      }

      const personData = workApiResult.data;

      // Step 3: Store in database
      const party = await this.storePartyData(personData, cpf);

      // Step 4: Create/update C2S customer
      const c2sResult = await this.createEnrichedCustomer(lead, personData);

      // Mark CPF as recently processed
      recentCpfCache.set(cpf, true);

      // Update lead status
      await this.dbStorage.updateLeadEnrichmentStatus(
        leadId,
        "completed",
        party.id,
        c2sResult.data.id,
      );

      enrichmentLogger.info(
        { leadId, cpf, c2sCustomerId: c2sResult.data.id },
        "Lead enrichment completed",
      );

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
      return {
        success: false,
        enriched: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      // Remove from processing cache
      processingLeadsCache.delete(leadId);
    }
  }

  private async storePartyData(
    person: WorkApiPerson,
    cpf: string,
  ): Promise<{ id: string }> {
    // Create/update party
    const partyData: NewParty = {
      type: "person",
      cpfCnpj: normalizeCpf(cpf),
      name: normalizeName(person.nome),
      gender: person.sexo,
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

  private async createEnrichedCustomer(lead: LeadData, person: WorkApiPerson) {
    const description = buildDescription(person, lead.campaignName);

    const leadData: C2SLeadCreate = {
      customer: normalizeName(person.nome) || lead.name,
      phone: lead.phone ? formatPhoneWithCountryCode(lead.phone) : undefined,
      email: lead.email ? (normalizeEmail(lead.email) ?? undefined) : undefined,
      description,
      source: lead.source || "google_ads",
      product: lead.campaignName,
    };

    return this.c2sService.createLead(leadData);
  }

  private async createUnenrichedCustomer(
    lead: LeadData,
  ): Promise<EnrichmentResult> {
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
        "unenriched",
        undefined,
        result.data.id,
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
  ): Promise<EnrichmentResult> {
    const description = buildSimpleDescription(
      lead.name,
      lead.phone,
      lead.email,
      lead.campaignName,
    );

    const leadData: C2SLeadCreate = {
      customer: normalizeName(lead.name) || lead.name,
      phone: lead.phone ? formatPhoneWithCountryCode(lead.phone) : undefined,
      email: lead.email ? (normalizeEmail(lead.email) ?? undefined) : undefined,
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
    );

    return {
      success: true,
      cpf,
      c2sCustomerId: result.data.id,
      enriched: false,
      message: "Customer created with CPF but no enrichment data",
    };
  }

  /**
   * Create customer with partial enrichment when Work API times out
   * CPF was discovered but enrichment data couldn't be fetched in time
   * Reference: Lead Operations Guide - "partial fallback" pattern
   */
  private async createPartialEnrichmentCustomer(
    lead: LeadData,
    cpf: string,
  ): Promise<EnrichmentResult> {
    const description = buildPartialEnrichmentDescription(
      lead.name,
      cpf,
      lead.phone,
      lead.email,
      lead.campaignName,
    );

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
}
