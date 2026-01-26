/**
 * Analyze patterns in unenriched leads
 */
import postgres from "postgres";

const LEADS_DB = "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  const sql = postgres(LEADS_DB);
  
  console.log("=== ANÁLISE DOS LEADS NÃO ENRIQUECIDOS ===\n");
  
  // 1. Leads marcados como unenriched
  const unenrichedStats = await sql`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN customer_phone IS NULL OR customer_phone = '' THEN 1 END) as no_phone,
      COUNT(CASE WHEN customer_phone IS NOT NULL AND customer_phone != '' AND length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) < 10 THEN 1 END) as short_phone,
      COUNT(CASE WHEN customer_phone IS NOT NULL AND customer_phone != '' AND length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) >= 10 THEN 1 END) as valid_phone
    FROM c2s.leads l
    JOIN c2s.enriched_leads e ON l.id = e.lead_id
    WHERE e.enrichment_status = 'unenriched'
  `;
  console.log("Status dos telefones nos unenriched:");
  console.log(`  Total unenriched: ${unenrichedStats[0].total}`);
  console.log(`  Sem telefone: ${unenrichedStats[0].no_phone}`);
  console.log(`  Telefone curto (<10 dígitos): ${unenrichedStats[0].short_phone}`);
  console.log(`  Telefone válido (>=10 dígitos): ${unenrichedStats[0].valid_phone}`);
  
  // 2. DDDs dos telefones válidos que não enriqueceram
  console.log("\n=== DDDs DOS TELEFONES QUE NÃO ENRIQUECERAM ===");
  const ddds = await sql`
    SELECT 
      substring(regexp_replace(customer_phone, '[^0-9]', '', 'g') from 1 for 2) as ddd,
      COUNT(*) as count
    FROM c2s.leads l
    JOIN c2s.enriched_leads e ON l.id = e.lead_id
    WHERE e.enrichment_status = 'unenriched'
    AND customer_phone IS NOT NULL 
    AND length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) >= 10
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 15
  `;
  for (const row of ddds) {
    console.log(`  DDD ${row.ddd}: ${row.count} leads`);
  }
  
  // 3. Amostra de telefones que não enriqueceram
  console.log("\n=== AMOSTRA DE 20 TELEFONES QUE NÃO ENRIQUECERAM ===");
  const samples = await sql`
    SELECT 
      l.customer_phone as phone,
      l.customer_name as name,
      l.customer_email as email,
      length(regexp_replace(l.customer_phone, '[^0-9]', '', 'g')) as digits
    FROM c2s.leads l
    JOIN c2s.enriched_leads e ON l.id = e.lead_id
    WHERE e.enrichment_status = 'unenriched'
    AND l.customer_phone IS NOT NULL AND l.customer_phone != ''
    AND length(regexp_replace(l.customer_phone, '[^0-9]', '', 'g')) >= 10
    ORDER BY random()
    LIMIT 20
  `;
  for (const row of samples) {
    console.log(`  ${row.phone} | ${row.name || 'N/A'} | ${row.email || 'N/A'}`);
  }
  
  // 4. Vendedores com mais leads não enriquecidos
  console.log("\n=== TOP 10 VENDEDORES COM LEADS NÃO ENRIQUECIDOS ===");
  const sellers = await sql`
    SELECT 
      l.seller_name,
      COUNT(*) as count
    FROM c2s.leads l
    JOIN c2s.enriched_leads e ON l.id = e.lead_id
    WHERE e.enrichment_status = 'unenriched'
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 10
  `;
  for (const row of sellers) {
    console.log(`  ${row.seller_name || 'Sem vendedor'}: ${row.count} leads`);
  }
  
  // 5. Origens com mais leads não enriquecidos
  console.log("\n=== TOP 10 ORIGENS COM LEADS NÃO ENRIQUECIDOS ===");
  const sources = await sql`
    SELECT 
      COALESCE(l.lead_source, 'N/A') as source,
      COUNT(*) as count
    FROM c2s.leads l
    JOIN c2s.enriched_leads e ON l.id = e.lead_id
    WHERE e.enrichment_status = 'unenriched'
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 10
  `;
  for (const row of sources) {
    console.log(`  ${row.source}: ${row.count} leads`);
  }
  
  // 6. Comparar taxa de sucesso por DDD
  console.log("\n=== TAXA DE SUCESSO POR DDD (top 10 DDDs) ===");
  const dddSuccess = await sql`
    WITH ddd_stats AS (
      SELECT 
        substring(regexp_replace(l.customer_phone, '[^0-9]', '', 'g') from 1 for 2) as ddd,
        COUNT(*) as total,
        COUNT(CASE WHEN e.enrichment_status IN ('completed', 'partial') THEN 1 END) as success,
        COUNT(CASE WHEN e.enrichment_status = 'unenriched' THEN 1 END) as failed
      FROM c2s.leads l
      JOIN c2s.enriched_leads e ON l.id = e.lead_id
      WHERE l.customer_phone IS NOT NULL 
      AND length(regexp_replace(l.customer_phone, '[^0-9]', '', 'g')) >= 10
      GROUP BY 1
      HAVING COUNT(*) >= 50
    )
    SELECT 
      ddd,
      total,
      success,
      failed,
      ROUND(100.0 * success / total, 1) as success_rate
    FROM ddd_stats
    ORDER BY total DESC
    LIMIT 10
  `;
  console.log("  DDD  | Total | Sucesso | Falha | Taxa");
  console.log("  -----|-------|---------|-------|------");
  for (const row of dddSuccess) {
    console.log(`  ${row.ddd}   | ${String(row.total).padStart(5)} | ${String(row.success).padStart(7)} | ${String(row.failed).padStart(5)} | ${row.success_rate}%`);
  }
  
  // 7. Canal com mais falhas
  console.log("\n=== TAXA DE SUCESSO POR CANAL ===");
  const channelSuccess = await sql`
    SELECT 
      COALESCE(l.channel, 'N/A') as channel,
      COUNT(*) as total,
      COUNT(CASE WHEN e.enrichment_status IN ('completed', 'partial') THEN 1 END) as success,
      COUNT(CASE WHEN e.enrichment_status = 'unenriched' THEN 1 END) as failed,
      ROUND(100.0 * COUNT(CASE WHEN e.enrichment_status IN ('completed', 'partial') THEN 1 END) / COUNT(*), 1) as success_rate
    FROM c2s.leads l
    JOIN c2s.enriched_leads e ON l.id = e.lead_id
    GROUP BY 1
    HAVING COUNT(*) >= 20
    ORDER BY 2 DESC
    LIMIT 10
  `;
  console.log("  Canal          | Total | Sucesso | Falha | Taxa");
  console.log("  ---------------|-------|---------|-------|------");
  for (const row of channelSuccess) {
    const channel = (row.channel || 'N/A').substring(0, 14).padEnd(14);
    console.log(`  ${channel} | ${String(row.total).padStart(5)} | ${String(row.success).padStart(7)} | ${String(row.failed).padStart(5)} | ${row.success_rate}%`);
  }
  
  await sql.end();
}

main().catch(console.error);
