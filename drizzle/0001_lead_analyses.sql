-- RML-872: Lead Analyses table for deep lead analysis
-- Created: 2026-01-15

CREATE TABLE IF NOT EXISTS "analytics"."lead_analyses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" varchar(255) NOT NULL,

  -- Tier classification
  "tier" varchar(20) NOT NULL,
  "tier_score" integer NOT NULL,

  -- Discovered information
  "discovered_full_name" varchar(255),
  "discovered_company" varchar(255),
  "discovered_role" varchar(255),
  "discovered_education" varchar(255),
  "discovered_linkedin" varchar(500),
  "discovered_instagram" varchar(255),
  "discovered_origin" varchar(255),
  "discovered_wealth_estimate" varchar(100),

  -- JSON arrays for complex data
  "portfolio" jsonb,
  "assets" jsonb,
  "alerts" jsonb,
  "highlights" jsonb,
  "sources" jsonb,

  -- Recommendation
  "recommendation_action" varchar(20),
  "recommendation_title" varchar(100),
  "recommendation_description" text,

  -- Analysis metadata
  "analysis_duration_ms" integer,
  "analysis_version" varchar(20) DEFAULT '1.0',

  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_lead_analyses_lead_id" ON "analytics"."lead_analyses" ("lead_id");
CREATE INDEX IF NOT EXISTS "idx_lead_analyses_tier" ON "analytics"."lead_analyses" ("tier");
CREATE INDEX IF NOT EXISTS "idx_lead_analyses_tier_score" ON "analytics"."lead_analyses" ("tier_score");
CREATE INDEX IF NOT EXISTS "idx_lead_analyses_created_at" ON "analytics"."lead_analyses" ("created_at");
