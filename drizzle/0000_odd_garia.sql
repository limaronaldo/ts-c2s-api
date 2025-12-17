CREATE TABLE IF NOT EXISTS "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"street" varchar(255),
	"number" varchar(20),
	"complement" varchar(100),
	"neighborhood" varchar(100),
	"city" varchar(100),
	"state" varchar(2),
	"zip_code" varchar(10),
	"is_primary" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_ads_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar(255) NOT NULL,
	"campaign_id" varchar(100),
	"campaign_name" varchar(255),
	"ad_group_id" varchar(100),
	"ad_group_name" varchar(255),
	"form_id" varchar(100),
	"form_name" varchar(255),
	"gclid_value" varchar(255),
	"name" varchar(255),
	"phone" varchar(50),
	"email" varchar(255),
	"raw_data" jsonb,
	"party_id" uuid,
	"c2s_customer_id" varchar(100),
	"enrichment_status" varchar(20) DEFAULT 'pending',
	"enriched_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_ads_leads_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(20) NOT NULL,
	"cpf_cnpj" varchar(20),
	"name" varchar(255),
	"trade_name" varchar(255),
	"birth_date" timestamp,
	"gender" varchar(10),
	"mother_name" varchar(255),
	"income" numeric(15, 2),
	"net_worth" numeric(15, 2),
	"occupation" varchar(255),
	"education_level" varchar(100),
	"marital_status" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parties_cpf_cnpj_unique" UNIQUE("cpf_cnpj")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "party_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"value" varchar(255) NOT NULL,
	"is_primary" boolean DEFAULT false,
	"is_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"source" varchar(50) NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"payload" jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_addresses_party" ON "addresses" ("party_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_addresses_city_state" ON "addresses" ("city","state");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_google_ads_leads_lead_id" ON "google_ads_leads" ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_google_ads_leads_campaign" ON "google_ads_leads" ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_google_ads_leads_status" ON "google_ads_leads" ("enrichment_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_google_ads_leads_party" ON "google_ads_leads" ("party_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_parties_cpf_cnpj" ON "parties" ("cpf_cnpj");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_parties_type" ON "parties" ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_party_contacts_party" ON "party_contacts" ("party_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_party_contacts_value" ON "party_contacts" ("value");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_party_contacts_unique" ON "party_contacts" ("party_id","type","value");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_webhook_events_external" ON "webhook_events" ("external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_events_status" ON "webhook_events" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_events_source" ON "webhook_events" ("source");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "addresses" ADD CONSTRAINT "addresses_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "google_ads_leads" ADD CONSTRAINT "google_ads_leads_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "party_contacts" ADD CONSTRAINT "party_contacts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
