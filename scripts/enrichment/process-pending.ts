/**
 * Process pending leads that were normalized or need re-enrichment
 * 
 * This script:
 * 1. Finds leads with status 'pending' or 'unenriched'
 * 2. Calls the batch/enrich-direct endpoint for each
 * 3. Updates the enriched_leads table with results
 */
import postgres from "postgres";

const LEADS_DB = "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const API_URL = "https://ts-c2s-api.fly.dev";

const BATCH_SIZE = 50;
const DELAY_MS = 2500; // 2.5s between requests to respect rate limits

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enrichLead(phone: string, name: string): Promise<{
  success: boolean;
  cpf?: string;
  status?: string;
  data?: any;
  error?: string;
}> {
  try {
    const response = await fetch(`${API_URL}/batch/enrich-direct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, name }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const result = await response.json();
    
    if (result.success && result.data) {
      return {
        success: true,
        cpf: result.data.cpf,
        status: result.data.status,
        data: result.data,
      };
    }

    return { success: false, error: result.error || "Unknown error" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function main() {
  const sql = postgres(LEADS_DB);

  console.log("=== PROCESSAMENTO DE LEADS PENDENTES ===\n");

  // Get pending leads
  const pendingLeads = await sql`
    SELECT 
      l.id as lead_id,
      l.customer_phone as phone,
      l.customer_phone_normalized as phone_normalized,
      l.customer_name as name,
      e.id as enriched_id,
      e.enrichment_status as status
    FROM c2s.leads l
    JOIN c2s.enriched_leads e ON l.id = e.lead_id
    WHERE e.enrichment_status IN ('pending', 'unenriched')
    AND l.customer_phone IS NOT NULL
    AND l.customer_phone != ''
    AND length(regexp_replace(COALESCE(l.customer_phone_normalized, l.customer_phone), '[^0-9]', '', 'g')) >= 10
    ORDER BY e.created_at DESC
    LIMIT ${BATCH_SIZE}
  `;

  console.log(`Found ${pendingLeads.length} pending leads to process\n`);

  if (pendingLeads.length === 0) {
    console.log("No pending leads to process!");
    await sql.end();
    return;
  }

  let processed = 0;
  let enriched = 0;
  let partial = 0;
  let failed = 0;

  for (const lead of pendingLeads) {
    const phone = lead.phone_normalized || lead.phone;
    const phoneDigits = phone.replace(/\D/g, '');
    
    process.stdout.write(`[${processed + 1}/${pendingLeads.length}] ${phoneDigits.substring(0, 4)}*** - ${lead.name || 'N/A'}... `);

    const result = await enrichLead(phoneDigits, lead.name || '');

    if (result.success && result.data) {
      const data = result.data;
      
      if (data.status === 'completed' && data.cpf) {
        // Full enrichment
        await sql`
          UPDATE c2s.enriched_leads
          SET 
            enrichment_status = 'completed',
            cpf = ${data.cpf},
            enriched_name = ${data.enrichedName || data.foundName},
            birth_date = ${data.birthDate ? new Date(data.birthDate.split('/').reverse().join('-')) : null},
            gender = ${data.gender},
            mother_name = ${data.motherName},
            income = ${data.income},
            presumed_income = ${data.presumedIncome},
            phones = ${JSON.stringify(data.phones || [])},
            emails = ${JSON.stringify(data.emails || [])},
            addresses = ${JSON.stringify(data.addresses || [])},
            cpf_source = ${data.cpfSource || 'work-api'},
            enriched_at = NOW(),
            work_api_raw = ${JSON.stringify(data)}
          WHERE id = ${lead.enriched_id}::uuid
        `;
        console.log(`✅ CPF: ${data.cpf}`);
        enriched++;
      } else if (data.status === 'partial' && data.cpf) {
        // Partial enrichment (CPF found but no full data)
        await sql`
          UPDATE c2s.enriched_leads
          SET 
            enrichment_status = 'partial',
            cpf = ${data.cpf},
            enriched_name = ${data.foundName},
            cpf_source = ${data.cpfSource || 'work-api-phone'},
            enriched_at = NOW(),
            work_api_raw = ${JSON.stringify(data)}
          WHERE id = ${lead.enriched_id}::uuid
        `;
        console.log(`⚠️ Partial - CPF: ${data.cpf}`);
        partial++;
      } else {
        // Unenriched
        await sql`
          UPDATE c2s.enriched_leads
          SET 
            enrichment_status = 'unenriched',
            enriched_at = NOW(),
            work_api_raw = ${JSON.stringify({ attempted: true, result: data })}
          WHERE id = ${lead.enriched_id}::uuid
        `;
        console.log(`❌ No CPF found`);
        failed++;
      }
    } else {
      // Error
      await sql`
        UPDATE c2s.enriched_leads
        SET 
          enrichment_status = 'unenriched',
          enriched_at = NOW(),
          work_api_raw = ${JSON.stringify({ error: result.error })}
        WHERE id = ${lead.enriched_id}::uuid
      `;
      console.log(`❌ Error: ${result.error}`);
      failed++;
    }

    processed++;

    // Rate limiting
    if (processed < pendingLeads.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Enriched (completed): ${enriched}`);
  console.log(`Partial: ${partial}`);
  console.log(`Failed/Unenriched: ${failed}`);
  console.log(`Success rate: ${((enriched + partial) / processed * 100).toFixed(1)}%`);

  // Show remaining
  const remaining = await sql`
    SELECT COUNT(*) as count
    FROM c2s.enriched_leads
    WHERE enrichment_status IN ('pending', 'unenriched')
  `;
  console.log(`\nRemaining to process: ${remaining[0].count}`);

  await sql.end();
}

main().catch(console.error);
