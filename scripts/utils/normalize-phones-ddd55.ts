/**
 * Normalize phones with duplicate DDD 55 prefix
 * 
 * Problem: 1,183 leads have phones like 5511999887766 instead of 11999887766
 * This script:
 * 1. Finds leads with 55 prefix (13+ digits starting with 55)
 * 2. Updates the normalized phone removing the 55 prefix
 * 3. Marks them for re-enrichment by setting status back to 'pending'
 */
import postgres from "postgres";

const LEADS_DB = "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  const sql = postgres(LEADS_DB);
  
  console.log("=== NORMALIZAÇÃO DE TELEFONES COM DDD 55 DUPLICADO ===\n");
  
  // 1. Find leads with 55 prefix that are unenriched
  const leadsToFix = await sql`
    SELECT 
      l.id,
      l.customer_phone,
      l.customer_phone_normalized,
      regexp_replace(l.customer_phone, '[^0-9]', '', 'g') as digits,
      e.id as enriched_id,
      e.enrichment_status
    FROM c2s.leads l
    JOIN c2s.enriched_leads e ON l.id = e.lead_id
    WHERE e.enrichment_status = 'unenriched'
    AND length(regexp_replace(l.customer_phone, '[^0-9]', '', 'g')) >= 12
    AND regexp_replace(l.customer_phone, '[^0-9]', '', 'g') LIKE '55%'
    AND substring(regexp_replace(l.customer_phone, '[^0-9]', '', 'g') from 3 for 2) IN (
      '11', '12', '13', '14', '15', '16', '17', '18', '19',
      '21', '22', '24', '27', '28',
      '31', '32', '33', '34', '35', '37', '38',
      '41', '42', '43', '44', '45', '46', '47', '48', '49',
      '51', '53', '54', '55',
      '61', '62', '63', '64', '65', '66', '67', '68', '69',
      '71', '73', '74', '75', '77', '79',
      '81', '82', '83', '84', '85', '86', '87', '88', '89',
      '91', '92', '93', '94', '95', '96', '97', '98', '99'
    )
    LIMIT 2000
  `;
  
  console.log(`Found ${leadsToFix.length} leads with duplicate 55 prefix\n`);
  
  if (leadsToFix.length === 0) {
    console.log("No leads to fix!");
    await sql.end();
    return;
  }
  
  // Show sample
  console.log("Sample of phones to normalize:");
  for (const lead of leadsToFix.slice(0, 10)) {
    const normalized = lead.digits.slice(2); // Remove 55 prefix
    console.log(`  ${lead.digits} → ${normalized}`);
  }
  console.log("");
  
  // 2. Update normalized phones and reset status
  let updated = 0;
  let errors = 0;
  
  for (const lead of leadsToFix) {
    try {
      const normalizedPhone = lead.digits.slice(2); // Remove 55 prefix
      
      // Update the lead's normalized phone
      await sql`
        UPDATE c2s.leads 
        SET customer_phone_normalized = ${normalizedPhone}
        WHERE id = ${lead.id}
      `;
      
      // Reset enrichment status to allow re-processing
      await sql`
        UPDATE c2s.enriched_leads 
        SET enrichment_status = 'pending',
            enriched_at = NULL
        WHERE id = ${lead.enriched_id}
      `;
      
      updated++;
      
      if (updated % 100 === 0) {
        console.log(`Progress: ${updated}/${leadsToFix.length} updated`);
      }
    } catch (error) {
      errors++;
      console.error(`Error updating lead ${lead.id}:`, error);
    }
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`\nThese leads are now marked as 'pending' and will be re-enriched.`);
  
  await sql.end();
}

main().catch(console.error);
