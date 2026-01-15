import { eq, and, inArray, sql, lt, or, isNull, desc } from "drizzle-orm";
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

  /**
   * Get database instance for direct queries
   * Used by services that need raw DB access
   */
  getDb() {
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
   * Now also saves contact data (name, phone, email) for analysis
   */
  async updateLeadEnrichmentStatus(
    leadId: string,
    status: string,
    partyId?: string,
    c2sCustomerId?: string,
    contactData?: {
      name?: string;
      phone?: string;
      email?: string;
      campaignName?: string;
    },
  ): Promise<void> {
    const existing = await this.findLeadByLeadId(leadId);

    if (existing) {
      // Update existing lead - only update contact data if provided and not already set
      await this.db
        .update(schema.googleAdsLeads)
        .set({
          enrichmentStatus: status,
          partyId,
          c2sCustomerId,
          enrichedAt: status === "completed" ? new Date() : undefined,
          // Update contact data only if provided
          ...(contactData?.name && !existing.name
            ? { name: contactData.name }
            : {}),
          ...(contactData?.phone && !existing.phone
            ? { phone: contactData.phone }
            : {}),
          ...(contactData?.email && !existing.email
            ? { email: contactData.email }
            : {}),
          ...(contactData?.campaignName && !existing.campaignName
            ? { campaignName: contactData.campaignName }
            : {}),
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
        name: contactData?.name,
        phone: contactData?.phone,
        email: contactData?.email,
        campaignName: contactData?.campaignName,
      });
      dbLogger.info(
        { leadId, status, name: contactData?.name },
        "Created new lead record for C2S lead",
      );
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

  // ============================================
  // Retry methods (RML-639)
  // ============================================

  /**
   * Get leads eligible for retry based on status, count, and timing
   */
  async getRetryableLeads(
    maxRetries: number,
    retryDelaysMs: number[],
  ): Promise<(typeof schema.googleAdsLeads.$inferSelect)[]> {
    const retryableStatuses = ["partial", "unenriched"];

    // Get all leads with retryable status and under max retries
    const leads = await this.db
      .select()
      .from(schema.googleAdsLeads)
      .where(
        and(
          inArray(schema.googleAdsLeads.enrichmentStatus, retryableStatuses),
          lt(schema.googleAdsLeads.retryCount, maxRetries),
        ),
      )
      .orderBy(schema.googleAdsLeads.createdAt);

    // Filter by timing in memory (complex date math is simpler here)
    const now = Date.now();
    return leads.filter((lead) => {
      if (!lead.lastRetryAt) return true; // Never retried, eligible immediately

      const retryCount = lead.retryCount ?? 0;
      const delayIndex = Math.min(retryCount, retryDelaysMs.length - 1);
      const requiredDelay = retryDelaysMs[delayIndex];
      const timeSinceLastRetry = now - lead.lastRetryAt.getTime();

      return timeSinceLastRetry >= requiredDelay;
    });
  }

  /**
   * Increment retry count and update last error
   */
  async incrementRetryCount(leadId: string, error: string): Promise<void> {
    await this.db
      .update(schema.googleAdsLeads)
      .set({
        retryCount: sql`COALESCE(${schema.googleAdsLeads.retryCount}, 0) + 1`,
        lastRetryAt: new Date(),
        lastError: error,
      })
      .where(eq(schema.googleAdsLeads.leadId, leadId));

    dbLogger.info({ leadId, error }, "Incremented retry count");
  }

  /**
   * Mark lead as permanently failed after max retries
   */
  async markLeadFailed(leadId: string, error: string): Promise<void> {
    await this.db
      .update(schema.googleAdsLeads)
      .set({
        enrichmentStatus: "failed",
        lastRetryAt: new Date(),
        lastError: error,
      })
      .where(eq(schema.googleAdsLeads.leadId, leadId));

    dbLogger.warn({ leadId, error }, "Marked lead as permanently failed");
  }

  // ============================================
  // Dashboard methods (RML-639)
  // ============================================

  /**
   * Get lead status counts for dashboard
   * @param dateFrom - Optional start date filter
   * @param dateTo - Optional end date filter
   */
  async getLeadStats(
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Record<string, number>> {
    const conditions = [];

    if (dateFrom) {
      conditions.push(
        sql`${schema.googleAdsLeads.createdAt} >= ${dateFrom.toISOString()}`,
      );
    }
    if (dateTo) {
      conditions.push(
        sql`${schema.googleAdsLeads.createdAt} <= ${dateTo.toISOString()}`,
      );
    }

    const query = this.db
      .select({
        status: schema.googleAdsLeads.enrichmentStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.googleAdsLeads);

    const results =
      conditions.length > 0
        ? await query
            .where(and(...conditions))
            .groupBy(schema.googleAdsLeads.enrichmentStatus)
        : await query.groupBy(schema.googleAdsLeads.enrichmentStatus);

    const stats: Record<string, number> = {};
    for (const row of results) {
      stats[row.status ?? "unknown"] = row.count;
    }
    return stats;
  }

  /**
   * Get recent leads for dashboard
   * @param limit - Max number of leads to return
   * @param dateFrom - Optional start date filter
   * @param dateTo - Optional end date filter
   */
  async getRecentLeads(
    limit: number = 20,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<(typeof schema.googleAdsLeads.$inferSelect)[]> {
    const conditions = [];

    if (dateFrom) {
      conditions.push(
        sql`${schema.googleAdsLeads.createdAt} >= ${dateFrom.toISOString()}`,
      );
    }
    if (dateTo) {
      conditions.push(
        sql`${schema.googleAdsLeads.createdAt} <= ${dateTo.toISOString()}`,
      );
    }

    const query = this.db.select().from(schema.googleAdsLeads);

    if (conditions.length > 0) {
      return query
        .where(and(...conditions))
        .orderBy(desc(schema.googleAdsLeads.createdAt))
        .limit(limit);
    }

    return query.orderBy(desc(schema.googleAdsLeads.createdAt)).limit(limit);
  }

  /**
   * Get leads that failed after max retries
   * @param limit - Max number of leads to return
   * @param dateFrom - Optional start date filter
   * @param dateTo - Optional end date filter
   */
  async getFailedLeads(
    limit: number = 50,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<(typeof schema.googleAdsLeads.$inferSelect)[]> {
    const conditions = [eq(schema.googleAdsLeads.enrichmentStatus, "failed")];

    if (dateFrom) {
      conditions.push(
        sql`${schema.googleAdsLeads.createdAt} >= ${dateFrom.toISOString()}`,
      );
    }
    if (dateTo) {
      conditions.push(
        sql`${schema.googleAdsLeads.createdAt} <= ${dateTo.toISOString()}`,
      );
    }

    return this.db
      .select()
      .from(schema.googleAdsLeads)
      .where(and(...conditions))
      .orderBy(desc(schema.googleAdsLeads.lastRetryAt))
      .limit(limit);
  }

  /**
   * Get leads that need reprocessing (status is null, unenriched, basic, or partial)
   * Used for manual reprocessing via dashboard
   */
  async getLeadsForReprocessing(
    limit: number = 50,
  ): Promise<(typeof schema.googleAdsLeads.$inferSelect)[]> {
    const reprocessStatuses = ["unenriched", "basic", "partial"];

    return this.db
      .select()
      .from(schema.googleAdsLeads)
      .where(
        or(
          isNull(schema.googleAdsLeads.enrichmentStatus),
          inArray(schema.googleAdsLeads.enrichmentStatus, reprocessStatuses),
        ),
      )
      .orderBy(desc(schema.googleAdsLeads.createdAt))
      .limit(limit);
  }

  /**
   * Reset lead status for reprocessing
   */
  async resetLeadForReprocessing(leadId: string): Promise<void> {
    await this.db
      .update(schema.googleAdsLeads)
      .set({
        enrichmentStatus: null,
        retryCount: 0,
        lastRetryAt: null,
        lastError: null,
        partyId: null,
        enrichedAt: null,
      })
      .where(eq(schema.googleAdsLeads.leadId, leadId));

    dbLogger.info({ leadId }, "Reset lead for reprocessing");
  }
}
