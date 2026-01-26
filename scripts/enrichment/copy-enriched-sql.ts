/**
 * Copy enriched party data using direct SQL matching
 * More efficient than TypeScript loop
 */

import { Client } from "pg";

// Production DB (ts-c2s-api with enriched data)
const PROD_DB_URL = "postgresql://neondb_owner:npg_xDdKzl0M2TAN@ep-lively-night-ac5stqsn-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

// Leads-MB DB (new database with C2S leads)
const LEADS_DB_URL = "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Copy Enriched Data (SQL-based)");
  console.log("═══════════════════════════════════════════════════════════════");

  const prodDb = new Client({ connectionString: PROD_DB_URL });
  const leadsDb = new Client({ connectionString: LEADS_DB_URL });

  await prodDb.connect();
  console.log("✅ Connected to Production DB");

  await leadsDb.connect();
  console.log("✅ Connected to Leads-MB DB");

  // Ensure table exists
  console.log("\n📝 Ensuring c2s.enriched_leads table exists...");
  await leadsDb.query(`
    DROP TABLE IF EXISTS c2s.enriched_leads CASCADE;

    CREATE TABLE c2s.enriched_leads (
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
  `);
  console.log("✅ Table created");

  // Export parties with normalized phones from production
  console.log("\n📥 Exporting parties with phones from Production...");
  const partiesResult = await prodDb.query(`
    SELECT DISTINCT ON (normalized_phone)
      p.id as party_id,
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
      CASE
        WHEN LENGTH(REGEXP_REPLACE(c.value, '\\D', '', 'g')) >= 12
             AND REGEXP_REPLACE(c.value, '\\D', '', 'g') LIKE '55%'
        THEN SUBSTRING(REGEXP_REPLACE(c.value, '\\D', '', 'g') FROM 3)
        ELSE REGEXP_REPLACE(c.value, '\\D', '', 'g')
      END as normalized_phone
    FROM analytics.parties p
    JOIN analytics.party_contacts c ON c.party_id = p.id
    WHERE p.cpf_cnpj IS NOT NULL
      AND c.type IN ('CELULAR', 'TELEFONE MÓVEL', 'MOVEL POSPAGO', 'MOVEL PREPAGO', 'FIXO', 'RESIDENCIAL', 'TELEFONE RESIDENCIAL', 'COMERCIAL', 'TELEFONE COMERCIAL')
      AND LENGTH(REGEXP_REPLACE(c.value, '\\D', '', 'g')) >= 10
    ORDER BY normalized_phone, p.income DESC NULLS LAST
  `);

  console.log(`   Found ${partiesResult.rows.length} party-phone combinations`);

  // Create temp table in leads-mb with the phone mappings
  console.log("\n📝 Creating temp phone mapping table...");
  await leadsDb.query(`
    CREATE TEMP TABLE phone_to_party (
      normalized_phone VARCHAR(20) PRIMARY KEY,
      party_id UUID,
      cpf VARCHAR(14),
      name VARCHAR(255),
      birth_date DATE,
      gender VARCHAR(10),
      mother_name VARCHAR(255),
      income NUMERIC(15, 2),
      net_worth NUMERIC(15, 2),
      occupation VARCHAR(255),
      education_level VARCHAR(100),
      marital_status VARCHAR(50)
    );
  `);

  // Insert in batches
  console.log("📤 Inserting phone mappings...");
  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < partiesResult.rows.length; i += batchSize) {
    const batch = partiesResult.rows.slice(i, i + batchSize);
    const values = batch.map((row, idx) => {
      const offset = idx * 12;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12})`;
    }).join(', ');

    const params = batch.flatMap(row => [
      row.normalized_phone,
      row.party_id,
      row.cpf,
      row.name,
      row.birth_date,
      row.gender,
      row.mother_name,
      row.income,
      row.net_worth,
      row.occupation,
      row.education_level,
      row.marital_status
    ]);

    await leadsDb.query(`
      INSERT INTO phone_to_party (normalized_phone, party_id, cpf, name, birth_date, gender, mother_name, income, net_worth, occupation, education_level, marital_status)
      VALUES ${values}
      ON CONFLICT (normalized_phone) DO NOTHING
    `, params);

    inserted += batch.length;
    process.stdout.write(`\r   Inserted ${inserted}/${partiesResult.rows.length} mappings`);
  }
  console.log("");

  // Now match and insert
  console.log("\n🔗 Matching leads to enriched parties...");
  const matchResult = await leadsDb.query(`
    INSERT INTO c2s.enriched_leads (
      lead_id, cpf, enriched_name, birth_date, gender, mother_name,
      income, net_worth, occupation, education, marital_status,
      enrichment_status, prod_party_id
    )
    SELECT DISTINCT ON (l.id)
      l.id,
      p.cpf,
      p.name,
      p.birth_date,
      p.gender,
      p.mother_name,
      p.income,
      p.net_worth,
      p.occupation,
      p.education_level,
      p.marital_status,
      'completed',
      p.party_id
    FROM c2s.leads l
    JOIN phone_to_party p ON l.customer_phone_normalized = p.normalized_phone
    ORDER BY l.id, p.income DESC NULLS LAST
    RETURNING lead_id
  `);

  console.log(`   ✅ Matched and inserted ${matchResult.rowCount} enriched leads`);

  // Add indexes
  await leadsDb.query(`
    CREATE INDEX IF NOT EXISTS idx_enriched_leads_lead_id ON c2s.enriched_leads(lead_id);
    CREATE INDEX IF NOT EXISTS idx_enriched_leads_cpf ON c2s.enriched_leads(cpf);
  `);

  // Summary
  console.log("\n📊 Summary:");

  const statsResult = await leadsDb.query(`
    SELECT
      COUNT(*) as total_enriched,
      COUNT(CASE WHEN income IS NOT NULL THEN 1 END) as with_income,
      ROUND(AVG(income::numeric), 2) as avg_income,
      ROUND(MAX(income::numeric), 2) as max_income
    FROM c2s.enriched_leads
  `);

  const stats = statsResult.rows[0];
  console.log(`   Total enriched leads: ${stats.total_enriched}`);
  console.log(`   With income data: ${stats.with_income}`);
  if (stats.avg_income) {
    console.log(`   Average income: R$ ${parseFloat(stats.avg_income).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`   Max income: R$ ${parseFloat(stats.max_income).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
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

  console.log(`\n   Leads still needing enrichment: ${needEnrichmentResult.rows[0].count}`);

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  ✅ COPY COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════");

  await prodDb.end();
  await leadsDb.end();
}

main().catch(console.error);
