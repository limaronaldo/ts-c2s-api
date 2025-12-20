import { eq, and, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import type {
  Party,
  NewParty,
  NewPartyContact,
  NewAddress,
  NewGoogleAdsLead,
  NewWebhookEvent,
} from "../db/schema";
import { dbLogger } from "../utils/logger";
import { normalizeCpf } from "../utils/normalize";

export class DbStorageService {
  private get db() {
    return getDb();
  }

  // Party operations
  async findPartyByCpf(cpf: string): Promise<Party | null> {
    const normalized = normalizeCpf(cpf);
    const results = await this.db
      .select()
      .from(schema.parties)
      .where(eq(schema.parties.cpfCnpj, normalized))
      .limit(1);

    return results[0] || null;
  }

  async upsertParty(data: NewParty): Promise<Party> {
    if (!data.cpfCnpj) {
      throw new Error("CPF/CNPJ is required for upsert");
    }

    const normalized = normalizeCpf(data.cpfCnpj);
    data.cpfCnpj = normalized;

    dbLogger.debug({ cpf: normalized }, "Upserting party");

    const existing = await this.findPartyByCpf(normalized);

    if (existing) {
      const [updated] = await this.db
        .update(schema.parties)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(schema.parties.id, existing.id))
        .returning();

      dbLogger.info(
        { partyId: updated.id, cpf: normalized },
        "Updated existing party",
      );
      return updated;
    }

    const [created] = await this.db
      .insert(schema.parties)
      .values(data)
      .returning();

    dbLogger.info(
      { partyId: created.id, cpf: normalized },
      "Created new party",
    );
    return created;
  }

  // Contact operations
  async upsertContact(data: NewPartyContact): Promise<void> {
    dbLogger.debug(
      { partyId: data.partyId, type: data.type, value: data.value },
      "Upserting contact",
    );

    await this.db
      .insert(schema.partyContacts)
      .values(data)
      .onConflictDoNothing({
        target: [
          schema.partyContacts.partyId,
          schema.partyContacts.type,
          schema.partyContacts.value,
        ],
      });
  }

  async findContactsByPartyId(
    partyId: string,
  ): Promise<(typeof schema.partyContacts.$inferSelect)[]> {
    return this.db
      .select()
      .from(schema.partyContacts)
      .where(eq(schema.partyContacts.partyId, partyId));
  }

  // Address operations
  async upsertAddress(data: NewAddress): Promise<void> {
    dbLogger.debug(
      { partyId: data.partyId, city: data.city },
      "Upserting address",
    );

    // Simple insert, addresses can have duplicates
    await this.db.insert(schema.addresses).values(data).onConflictDoNothing();
  }

  // Google Ads Lead operations
  async findLeadByLeadId(
    leadId: string,
  ): Promise<typeof schema.googleAdsLeads.$inferSelect | null> {
    const results = await this.db
      .select()
      .from(schema.googleAdsLeads)
      .where(eq(schema.googleAdsLeads.leadId, leadId))
      .limit(1);

    return results[0] || null;
  }

  async upsertGoogleAdsLead(
    data: NewGoogleAdsLead,
  ): Promise<typeof schema.googleAdsLeads.$inferSelect> {
    dbLogger.debug({ leadId: data.leadId }, "Upserting Google Ads lead");

    const existing = await this.findLeadByLeadId(data.leadId);

    if (existing) {
      const [updated] = await this.db
        .update(schema.googleAdsLeads)
        .set(data)
        .where(eq(schema.googleAdsLeads.id, existing.id))
        .returning();

      return updated;
    }

    const [created] = await this.db
      .insert(schema.googleAdsLeads)
      .values(data)
      .returning();

    return created;
  }

  /**
   * Upsert lead enrichment status
   * Creates the lead record if it doesn't exist (for leads fetched from C2S API)
   * Updates the status if it already exists
   */
  async updateLeadEnrichmentStatus(
    leadId: string,
    status: string,
    partyId?: string,
    c2sCustomerId?: string,
  ): Promise<void> {
    const existing = await this.findLeadByLeadId(leadId);

    if (existing) {
      // Update existing lead
      await this.db
        .update(schema.googleAdsLeads)
        .set({
          enrichmentStatus: status,
          partyId,
          c2sCustomerId,
          enrichedAt: status === "completed" ? new Date() : undefined,
        })
        .where(eq(schema.googleAdsLeads.leadId, leadId));
    } else {
      // Create new lead record (for leads fetched from C2S API)
      await this.db.insert(schema.googleAdsLeads).values({
        leadId,
        enrichmentStatus: status,
        partyId,
        c2sCustomerId,
        enrichedAt: status === "completed" ? new Date() : undefined,
      });
      dbLogger.info({ leadId, status }, "Created new lead record for C2S lead");
    }
  }

  /**
   * Get leads by enrichment status
   * Used for batch retry of failed/partial enrichments (RML-618)
   */
  async getLeadsByStatus(
    statuses: string[],
  ): Promise<(typeof schema.googleAdsLeads.$inferSelect)[]> {
    return this.db
      .select()
      .from(schema.googleAdsLeads)
      .where(inArray(schema.googleAdsLeads.enrichmentStatus, statuses))
      .orderBy(schema.googleAdsLeads.createdAt);
  }

  // Webhook event operations (for idempotency)
  async findWebhookEvent(
    externalId: string,
  ): Promise<typeof schema.webhookEvents.$inferSelect | null> {
    const results = await this.db
      .select()
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.externalId, externalId))
      .limit(1);

    return results[0] || null;
  }

  async createWebhookEvent(
    data: NewWebhookEvent,
  ): Promise<typeof schema.webhookEvents.$inferSelect> {
    const [created] = await this.db
      .insert(schema.webhookEvents)
      .values(data)
      .returning();

    return created;
  }

  async updateWebhookEventStatus(
    id: string,
    status: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.db
      .update(schema.webhookEvents)
      .set({
        status,
        processedAt: status === "completed" ? new Date() : undefined,
        errorMessage,
      })
      .where(eq(schema.webhookEvents.id, id));
  }
}
