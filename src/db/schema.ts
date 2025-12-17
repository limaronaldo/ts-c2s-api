import { pgTable, uuid, varchar, text, timestamp, numeric, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'

// Parties table (companies and people)
export const parties = pgTable(
  'parties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: varchar('type', { length: 20 }).notNull(), // 'person' or 'company'
    cpfCnpj: varchar('cpf_cnpj', { length: 20 }).unique(),
    name: varchar('name', { length: 255 }),
    tradeName: varchar('trade_name', { length: 255 }),
    birthDate: timestamp('birth_date'),
    gender: varchar('gender', { length: 10 }),
    motherName: varchar('mother_name', { length: 255 }),
    income: numeric('income', { precision: 15, scale: 2 }),
    netWorth: numeric('net_worth', { precision: 15, scale: 2 }),
    occupation: varchar('occupation', { length: 255 }),
    educationLevel: varchar('education_level', { length: 100 }),
    maritalStatus: varchar('marital_status', { length: 50 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_parties_cpf_cnpj').on(table.cpfCnpj), index('idx_parties_type').on(table.type)]
)

// Party contacts (phones, emails)
export const partyContacts = pgTable(
  'party_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partyId: uuid('party_id')
      .references(() => parties.id)
      .notNull(),
    type: varchar('type', { length: 20 }).notNull(), // 'phone', 'email', 'whatsapp'
    value: varchar('value', { length: 255 }).notNull(),
    isPrimary: boolean('is_primary').default(false),
    isVerified: boolean('is_verified').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_party_contacts_party').on(table.partyId),
    index('idx_party_contacts_value').on(table.value),
    uniqueIndex('idx_party_contacts_unique').on(table.partyId, table.type, table.value),
  ]
)

// Addresses
export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partyId: uuid('party_id')
      .references(() => parties.id)
      .notNull(),
    street: varchar('street', { length: 255 }),
    number: varchar('number', { length: 20 }),
    complement: varchar('complement', { length: 100 }),
    neighborhood: varchar('neighborhood', { length: 100 }),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 2 }),
    zipCode: varchar('zip_code', { length: 10 }),
    isPrimary: boolean('is_primary').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_addresses_party').on(table.partyId), index('idx_addresses_city_state').on(table.city, table.state)]
)

// Webhook events for idempotency
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    externalId: varchar('external_id', { length: 255 }).unique().notNull(),
    source: varchar('source', { length: 50 }).notNull(), // 'google_ads', 'facebook', etc.
    eventType: varchar('event_type', { length: 50 }).notNull(),
    payload: jsonb('payload'),
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    processedAt: timestamp('processed_at'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_webhook_events_external').on(table.externalId),
    index('idx_webhook_events_status').on(table.status),
    index('idx_webhook_events_source').on(table.source),
  ]
)

// Google Ads leads
export const googleAdsLeads = pgTable(
  'google_ads_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: varchar('lead_id', { length: 255 }).unique().notNull(),
    campaignId: varchar('campaign_id', { length: 100 }),
    campaignName: varchar('campaign_name', { length: 255 }),
    adGroupId: varchar('ad_group_id', { length: 100 }),
    adGroupName: varchar('ad_group_name', { length: 255 }),
    formId: varchar('form_id', { length: 100 }),
    formName: varchar('form_name', { length: 255 }),
    gclidValue: varchar('gclid_value', { length: 255 }),
    name: varchar('name', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 255 }),
    rawData: jsonb('raw_data'),
    partyId: uuid('party_id').references(() => parties.id),
    c2sCustomerId: varchar('c2s_customer_id', { length: 100 }),
    enrichmentStatus: varchar('enrichment_status', { length: 20 }).default('pending'),
    enrichedAt: timestamp('enriched_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_google_ads_leads_lead_id').on(table.leadId),
    index('idx_google_ads_leads_campaign').on(table.campaignId),
    index('idx_google_ads_leads_status').on(table.enrichmentStatus),
    index('idx_google_ads_leads_party').on(table.partyId),
  ]
)

// Type exports
export type Party = typeof parties.$inferSelect
export type NewParty = typeof parties.$inferInsert
export type PartyContact = typeof partyContacts.$inferSelect
export type NewPartyContact = typeof partyContacts.$inferInsert
export type Address = typeof addresses.$inferSelect
export type NewAddress = typeof addresses.$inferInsert
export type WebhookEvent = typeof webhookEvents.$inferSelect
export type NewWebhookEvent = typeof webhookEvents.$inferInsert
export type GoogleAdsLead = typeof googleAdsLeads.$inferSelect
export type NewGoogleAdsLead = typeof googleAdsLeads.$inferInsert
