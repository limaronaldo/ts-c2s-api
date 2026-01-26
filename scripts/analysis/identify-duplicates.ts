/**
 * Identify and mark duplicate leads by phone and email
 * Uses batch inserts for performance
 */

import { Client } from "pg";

const DB_URL =
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  Identifying Duplicate Leads");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log("✅ Connected to PostgreSQL");

  // Get total leads count
  const totalResult = await db.query("SELECT COUNT(*) FROM c2s.leads");
  console.log(`📋 Total leads: ${totalResult.rows[0].count}`);

  // Create lead_duplicates table
  console.log("\n📝 Creating lead_duplicates table...");
  await db.query(`
    DROP TABLE IF EXISTS c2s.lead_duplicates CASCADE;

    CREATE TABLE c2s.lead_duplicates (
      id SERIAL PRIMARY KEY,
      lead_id VARCHAR(64) NOT NULL,
      duplicate_of VARCHAR(64) NOT NULL,
      match_type VARCHAR(20) NOT NULL,
      match_value VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  console.log("✅ Table created");

  // Insert phone duplicates directly with SQL
  console.log("\n🔍 Finding and inserting phone duplicates...");
  const phoneResult = await db.query(`
    WITH phone_groups AS (
      SELECT
        customer_phone_normalized as phone,
        ARRAY_AGG(id ORDER BY created_at ASC) as lead_ids
      FROM c2s.leads
      WHERE customer_phone_normalized IS NOT NULL
        AND customer_phone_normalized != ''
        AND LENGTH(customer_phone_normalized) >= 10
      GROUP BY customer_phone_normalized
      HAVING COUNT(*) > 1
    ),
    duplicates AS (
      SELECT
        phone,
        lead_ids[1] as original_id,
        UNNEST(lead_ids[2:]) as dup_id
      FROM phone_groups
    )
    INSERT INTO c2s.lead_duplicates (lead_id, duplicate_of, match_type, match_value)
    SELECT dup_id, original_id, 'phone', phone
    FROM duplicates
    RETURNING id
  `);
  console.log(`   ✅ Marked ${phoneResult.rowCount} leads as phone duplicates`);

  // Insert email duplicates directly with SQL
  console.log("\n🔍 Finding and inserting email duplicates...");
  const emailResult = await db.query(`
    WITH email_groups AS (
      SELECT
        LOWER(customer_email) as email,
        ARRAY_AGG(id ORDER BY created_at ASC) as lead_ids
      FROM c2s.leads
      WHERE customer_email IS NOT NULL
        AND customer_email != ''
        AND customer_email LIKE '%@%'
      GROUP BY LOWER(customer_email)
      HAVING COUNT(*) > 1
    ),
    duplicates AS (
      SELECT
        email,
        lead_ids[1] as original_id,
        UNNEST(lead_ids[2:]) as dup_id
      FROM email_groups
    )
    INSERT INTO c2s.lead_duplicates (lead_id, duplicate_of, match_type, match_value)
    SELECT dup_id, original_id, 'email', email
    FROM duplicates
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  console.log(`   ✅ Marked ${emailResult.rowCount} leads as email duplicates`);

  // Add indexes after bulk insert
  console.log("\n📝 Creating indexes...");
  await db.query(`
    CREATE INDEX idx_lead_duplicates_lead_id ON c2s.lead_duplicates(lead_id);
    CREATE INDEX idx_lead_duplicates_duplicate_of ON c2s.lead_duplicates(duplicate_of);
  `);

  // Summary statistics
  console.log("\n📊 Duplicate Summary:");

  const statsResult = await db.query(`
    SELECT
      COUNT(*) as total_dup_records,
      COUNT(DISTINCT lead_id) as unique_dup_leads,
      COUNT(CASE WHEN match_type = 'phone' THEN 1 END) as phone_dups,
      COUNT(CASE WHEN match_type = 'email' THEN 1 END) as email_dups
    FROM c2s.lead_duplicates
  `);

  const stats = statsResult.rows[0];
  const totalLeads = parseInt(totalResult.rows[0].count);
  const uniqueLeads = totalLeads - parseInt(stats.unique_dup_leads);

  console.log(`   Total leads: ${totalLeads.toLocaleString()}`);
  console.log(
    `   Duplicate leads: ${parseInt(stats.unique_dup_leads).toLocaleString()}`,
  );
  console.log(`   Unique leads: ${uniqueLeads.toLocaleString()}`);
  console.log(
    `   Phone duplicates: ${parseInt(stats.phone_dups).toLocaleString()}`,
  );
  console.log(
    `   Email duplicates: ${parseInt(stats.email_dups).toLocaleString()}`,
  );

  // Top repeat customers
  console.log("\n🏆 Top repeat customers (by phone):");
  const topRepeaters = await db.query(`
    SELECT
      l.customer_phone_normalized as phone,
      l.customer_name,
      COUNT(*) as appearances
    FROM c2s.leads l
    WHERE l.customer_phone_normalized IS NOT NULL
      AND LENGTH(l.customer_phone_normalized) >= 10
    GROUP BY l.customer_phone_normalized, l.customer_name
    HAVING COUNT(*) > 5
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `);

  for (const row of topRepeaters.rows) {
    console.log(`   ${row.customer_name}: ${row.appearances}x (${row.phone})`);
  }

  console.log(
    "\n═══════════════════════════════════════════════════════════════",
  );
  console.log("  ✅ DUPLICATE IDENTIFICATION COMPLETE");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  await db.end();
}

main().catch(console.error);
