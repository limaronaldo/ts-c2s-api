import {
  pgTable,
  pgSchema,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  integer,
} from "drizzle-orm/pg-core";

// Define the analytics schema
const analyticsSchema = pgSchema("analytics");

// Parties table (companies and people) - in analytics schema
export const parties = analyticsSchema.table(
  "parties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 20 }).notNull(), // 'person' or 'company'
    cpfCnpj: varchar("cpf_cnpj", { length: 20 }).unique(),
    name: varchar("name", { length: 255 }),
    tradeName: varchar("trade_name", { length: 255 }),
    birthDate: timestamp("birth_date"),
    gender: varchar("gender", { length: 10 }),
    motherName: varchar("mother_name", { length: 255 }),
    income: numeric("income", { precision: 15, scale: 2 }),
    netWorth: numeric("net_worth", { precision: 15, scale: 2 }),
    occupation: varchar("occupation", { length: 255 }),
    educationLevel: varchar("education_level", { length: 100 }),
    maritalStatus: varchar("marital_status", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    cpfCnpjIdx: index("idx_parties_cpf_cnpj").on(table.cpfCnpj),
    typeIdx: index("idx_parties_type").on(table.type),
  }),
);

// Party contacts (phones, emails) - in analytics schema
export const partyContacts = analyticsSchema.table(
  "party_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partyId: uuid("party_id")
      .references(() => parties.id)
      .notNull(),
    type: varchar("type", { length: 20 }).notNull(), // 'phone', 'email', 'whatsapp'
    value: varchar("value", { length: 255 }).notNull(),
    isPrimary: boolean("is_primary").default(false),
    isVerified: boolean("is_verified").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    partyIdx: index("idx_party_contacts_party").on(table.partyId),
    valueIdx: index("idx_party_contacts_value").on(table.value),
    uniqueIdx: uniqueIndex("idx_party_contacts_unique").on(
      table.partyId,
      table.type,
      table.value,
    ),
  }),
);

// Addresses - in analytics schema
export const addresses = analyticsSchema.table(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partyId: uuid("party_id")
      .references(() => parties.id)
      .notNull(),
    street: varchar("street", { length: 255 }),
    number: varchar("number", { length: 20 }),
    complement: varchar("complement", { length: 100 }),
    neighborhood: varchar("neighborhood", { length: 100 }),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 2 }),
    zipCode: varchar("zip_code", { length: 10 }),
    isPrimary: boolean("is_primary").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    partyIdx: index("idx_addresses_party").on(table.partyId),
    cityStateIdx: index("idx_addresses_city_state").on(table.city, table.state),
  }),
);

// Webhook events for idempotency - in analytics schema
export const webhookEvents = analyticsSchema.table(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: varchar("external_id", { length: 255 }).unique().notNull(),
    source: varchar("source", { length: 50 }).notNull(), // 'google_ads', 'facebook', etc.
    eventType: varchar("event_type", { length: 50 }).notNull(),
    payload: jsonb("payload"),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    processedAt: timestamp("processed_at"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    externalIdx: uniqueIndex("idx_webhook_events_external").on(
      table.externalId,
    ),
    statusIdx: index("idx_webhook_events_status").on(table.status),
    sourceIdx: index("idx_webhook_events_source").on(table.source),
  }),
);

// Google Ads leads - matches analytics.google_ads_leads schema
// Note: explicitly using analytics schema to avoid conflict with public.google_ads_leads
export const googleAdsLeads = analyticsSchema.table(
  "google_ads_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: varchar("lead_id", { length: 255 }).unique().notNull(),
    campaignId: varchar("campaign_id", { length: 100 }),
    campaignName: varchar("campaign_name", { length: 255 }),
    adGroupId: varchar("ad_group_id", { length: 100 }),
    adGroupName: varchar("ad_group_name", { length: 255 }),
    formId: varchar("form_id", { length: 100 }),
    formName: varchar("form_name", { length: 255 }),
    gclidValue: varchar("gclid_value", { length: 255 }),
    name: varchar("name", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 255 }),
    rawData: jsonb("raw_data"),
    partyId: uuid("party_id").references(() => parties.id),
    c2sCustomerId: varchar("c2s_customer_id", { length: 100 }),
    enrichmentStatus: varchar("enrichment_status", { length: 20 }).default(
      "pending",
    ),
    enrichedAt: timestamp("enriched_at"),
    // Retry tracking columns (RML-639)
    retryCount: integer("retry_count").default(0),
    lastRetryAt: timestamp("last_retry_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    leadIdIdx: uniqueIndex("idx_google_ads_leads_lead_id").on(table.leadId),
    campaignIdx: index("idx_google_ads_leads_campaign").on(table.campaignId),
    statusIdx: index("idx_google_ads_leads_status").on(table.enrichmentStatus),
    partyIdx: index("idx_google_ads_leads_party").on(table.partyId),
    // Index for retry queries (RML-639)
    retryIdx: index("idx_google_ads_leads_retry").on(
      table.enrichmentStatus,
      table.retryCount,
      table.lastRetryAt,
    ),
  }),
);

// Type exports
export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;
export type PartyContact = typeof partyContacts.$inferSelect;
export type NewPartyContact = typeof partyContacts.$inferInsert;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
export type GoogleAdsLead = typeof googleAdsLeads.$inferSelect;
export type NewGoogleAdsLead = typeof googleAdsLeads.$inferInsert;
