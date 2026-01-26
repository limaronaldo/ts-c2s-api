/**
 * Copy enriched party data from production DB to leads-mb DB
 * Matches parties by phone number to link with C2S leads
 */

import { Client } from "pg";

// Production DB (ts-c2s-api with enriched data)
const PROD_DB_URL =
  "postgresql://neondb_owner:npg_xDdKzl0M2TAN@ep-lively-night-ac5stqsn-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

// Leads-MB DB (new database with C2S leads)
const LEADS_DB_URL =
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  Copy Enriched Data: Production → Leads-MB");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  // Connect to both databases
  const prodDb = new Client({ connectionString: PROD_DB_URL });
  const leadsDb = new Client({ connectionString: LEADS_DB_URL });

  await prodDb.connect();
  console.log("✅ Connected to Production DB");

  await leadsDb.connect();
  console.log("✅ Connected to Leads-MB DB");

  // Create enriched_leads table in leads-mb if not exists
  console.log("\n📝 Creating c2s.enriched_leads table...");
  await leadsDb.query(`
    CREATE TABLE IF NOT EXISTS c2s.enriched_leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id VARCHAR(64) REFERENCES c2s.leads(id),
      cpf VARCHAR(14),
      enriched_name VARCHAR(255),
      birth_date DATE,
      gender VARCHAR(10),
      mother_name VARCHAR(255),
      income NUMERIC(15, 2),
      presumed_income NUMERIC(15, 2),
      net_worth NUMERIC(15, 2),
      occupation VARCHAR(255),
      education VARCHAR(100),
      marital_status VARCHAR(50),
      phones JSONB,
      emails JSONB,
      addresses JSONB,
      cpf_source VARCHAR(50),
      enrichment_status VARCHAR(20) DEFAULT 'completed',
      enriched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      work_api_raw JSONB,
      prod_party_id UUID,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_enriched_leads_lead_id ON c2s.enriched_leads(lead_id);
    CREATE INDEX IF NOT EXISTS idx_enriched_leads_cpf ON c2s.enriched_leads(cpf);
  `);
  console.log("✅ Table ready");

  // Get all parties with contacts from production
  console.log("\n📥 Fetching enriched parties from Production...");
  const partiesResult = await prodDb.query(`
    SELECT
      p.id,
      p.cpf_cnpj as cpf,
      p.name,
      p.birth_date,
      p.gender,
      p.mother_name,
      p.income,
      p.net_worth,
      p.occupation,
      p.education_level,
      p.marital_status,
      p.created_at,
      (
        SELECT jsonb_agg(jsonb_build_object('type', c.type, 'value', c.value, 'is_primary', c.is_primary))
        FROM analytics.party_contacts c WHERE c.party_id = p.id
        AND c.type IN ('CELULAR', 'TELEFONE MÓVEL', 'MOVEL POSPAGO', 'MOVEL PREPAGO', 'FIXO', 'RESIDENCIAL', 'TELEFONE RESIDENCIAL', 'COMERCIAL', 'TELEFONE COMERCIAL')
      ) as phones,
      (
        SELECT jsonb_agg(jsonb_build_object('type', c.type, 'value', c.value, 'is_primary', c.is_primary))
        FROM analytics.party_contacts c WHERE c.party_id = p.id AND c.type = 'email'
      ) as emails,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'street', a.street, 'number', a.number, 'complement', a.complement,
          'neighborhood', a.neighborhood, 'city', a.city, 'state', a.state, 'zip_code', a.zip_code
        ))
        FROM analytics.addresses a WHERE a.party_id = p.id
      ) as addresses
    FROM analytics.parties p
    WHERE p.cpf_cnpj IS NOT NULL
    ORDER BY p.created_at DESC
  `);

  console.log(`   Found ${partiesResult.rows.length} enriched parties`);

  // Build phone lookup map (normalized phone -> party data)
  console.log("\n🔗 Building phone lookup map...");
  const phoneToParty = new Map<string, any>();

  for (const party of partiesResult.rows) {
    if (party.phones) {
      for (const phone of party.phones) {
        const normalized = normalizePhone(phone.value);
        if (normalized && !phoneToParty.has(normalized)) {
          phoneToParty.set(normalized, party);
        }
      }
    }
  }
  console.log(`   ${phoneToParty.size} unique phone numbers mapped`);

  // Get C2S leads that need matching
  console.log("\n📋 Fetching C2S leads to match...");
  const leadsResult = await leadsDb.query(`
    SELECT id, customer_phone_normalized, customer_email, customer_name
    FROM c2s.leads
    WHERE customer_phone_normalized IS NOT NULL
      AND id NOT IN (SELECT lead_id FROM c2s.enriched_leads WHERE lead_id IS NOT NULL)
  `);
  console.log(`   ${leadsResult.rows.length} leads to check`);

  // Match leads to parties
  console.log("\n🔍 Matching leads to enriched parties...");
  let matched = 0;
  let inserted = 0;

  for (const lead of leadsResult.rows) {
    const party = phoneToParty.get(lead.customer_phone_normalized);

    if (party) {
      matched++;

      try {
        await leadsDb.query(
          `
          INSERT INTO c2s.enriched_leads (
            lead_id, cpf, enriched_name, birth_date, gender, mother_name,
            income, net_worth, occupation, education, marital_status,
            phones, emails, addresses, enrichment_status, prod_party_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT DO NOTHING
        `,
          [
            lead.id,
            party.cpf,
            party.name,
            party.birth_date,
            party.gender,
            party.mother_name,
            party.income,
            party.net_worth,
            party.occupation,
            party.education_level,
            party.marital_status,
            JSON.stringify(party.phones),
            JSON.stringify(party.emails),
            JSON.stringify(party.addresses),
            "completed",
            party.id,
          ],
        );
        inserted++;
      } catch (err) {
        // Skip errors
      }
    }

    if (matched % 500 === 0) {
      process.stdout.write(
        `\r   Checked ${matched} matches, inserted ${inserted}...`,
      );
    }
  }

  console.log(
    `\n   ✅ Matched ${matched} leads, inserted ${inserted} enrichment records`,
  );

  // Summary
  console.log("\n📊 Summary:");

  const statsResult = await leadsDb.query(`
    SELECT
      COUNT(*) as total_enriched,
      COUNT(CASE WHEN income IS NOT NULL THEN 1 END) as with_income,
      AVG(income::numeric) as avg_income,
      MAX(income::numeric) as max_income
    FROM c2s.enriched_leads
  `);

  const stats = statsResult.rows[0];
  console.log(`   Total enriched leads: ${stats.total_enriched}`);
  console.log(`   With income data: ${stats.with_income}`);
  if (stats.avg_income) {
    console.log(
      `   Average income: R$ ${parseFloat(stats.avg_income).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    );
    console.log(
      `   Max income: R$ ${parseFloat(stats.max_income).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    );
  }

  // Count leads still needing enrichment
  const needEnrichmentResult = await leadsDb.query(`
    SELECT COUNT(DISTINCT l.id) as count
    FROM c2s.leads l
    LEFT JOIN c2s.enriched_leads e ON l.id = e.lead_id
    LEFT JOIN c2s.lead_duplicates d ON l.id = d.lead_id
    WHERE e.lead_id IS NULL
      AND d.lead_id IS NULL
  `);

  console.log(
    `\n   Leads still needing enrichment: ${needEnrichmentResult.rows[0].count}`,
  );

  console.log(
    "\n═══════════════════════════════════════════════════════════════",
  );
  console.log("  ✅ COPY COMPLETE");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  await prodDb.end();
  await leadsDb.end();
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  // Remove country code 55 if present
  if (digits.length >= 12 && digits.startsWith("55")) {
    return digits.slice(2);
  }
  return digits || null;
}

main().catch(console.error);
