import postgres from "postgres";

const LEADS_DB = "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  const sql = postgres(LEADS_DB);
  
  console.log("=== SCHEMA c2s.leads ===");
  const leadsColumns = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'c2s' AND table_name = 'leads'
    ORDER BY ordinal_position
  `;
  for (const col of leadsColumns) {
    console.log(`  ${col.column_name}: ${col.data_type}`);
  }
  
  console.log("\n=== SCHEMA c2s.enriched_leads ===");
  const enrichedColumns = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'c2s' AND table_name = 'enriched_leads'
    ORDER BY ordinal_position
  `;
  for (const col of enrichedColumns) {
    console.log(`  ${col.column_name}: ${col.data_type}`);
  }
  
  await sql.end();
}

main().catch(console.error);
