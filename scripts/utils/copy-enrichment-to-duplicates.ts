import pg from "pg";

const db = new pg.Pool({
  connectionString: "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require"
});

async function main() {
  console.log("🔄 Copying enrichment data from originals to duplicates...\n");

  // Copy enrichment data from originals to duplicates
  const result = await db.query(`
    INSERT INTO c2s.enriched_leads (
      lead_id, cpf, enriched_name, birth_date, gender, mother_name,
      income, presumed_income, net_worth, occupation, education, marital_status,
      phones, emails, addresses, cpf_source, enrichment_status, enriched_at, work_api_raw
    )
    SELECT
      d.lead_id,
      e.cpf,
      e.enriched_name,
      e.birth_date,
      e.gender,
      e.mother_name,
      e.income,
      e.presumed_income,
      e.net_worth,
      e.occupation,
      e.education,
      e.marital_status,
      e.phones,
      e.emails,
      e.addresses,
      'duplicate_of:' || d.duplicate_of,
      e.enrichment_status,
      NOW(),
      e.work_api_raw
    FROM c2s.lead_duplicates d
    JOIN c2s.enriched_leads e ON d.duplicate_of = e.lead_id
    LEFT JOIN c2s.enriched_leads existing ON d.lead_id = existing.lead_id
    WHERE existing.lead_id IS NULL
    ON CONFLICT (lead_id) DO NOTHING
    RETURNING lead_id
  `);

  console.log(`✅ Copied enrichment to ${result.rowCount} duplicate leads\n`);

  // Verify new totals
  const totals = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM c2s.enriched_leads) as total_enriched,
      (SELECT COUNT(*) FROM c2s.enriched_leads WHERE enrichment_status = 'completed') as completed,
      (SELECT COUNT(*) FROM c2s.enriched_leads WHERE enrichment_status = 'partial') as partial,
      (SELECT COUNT(*) FROM c2s.enriched_leads WHERE enrichment_status = 'unenriched') as unenriched,
      (SELECT COUNT(*) FROM c2s.enriched_leads WHERE cpf_source LIKE 'duplicate_of:%') as from_duplicates
  `);

  console.log("📊 New totals:");
  console.log(`   Total enriched: ${totals.rows[0].total_enriched}`);
  console.log(`   ✅ Completed: ${totals.rows[0].completed}`);
  console.log(`   ⚠️  Partial: ${totals.rows[0].partial}`);
  console.log(`   ❌ Unenriched: ${totals.rows[0].unenriched}`);
  console.log(`   🔗 From duplicates: ${totals.rows[0].from_duplicates}`);

  await db.end();
}

main().catch(console.error);
