/**
 * Flag leads with invalid phone numbers
 */
import postgres from "postgres";

const LEADS_DB = "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";

// Valid Brazilian DDDs
const VALID_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

const FAKE_PATTERNS = [
  /^(\d)\1{10,}$/,
  /^12345678901$/,
  /^98765456789$/,
  /^0{10,}$/,
  /^123456789\d*$/,
  /^987654321\d*$/,
];

function isValidBrazilianPhone(digits: string): { valid: boolean; reason?: string } {
  if (digits.length < 10) return { valid: false, reason: 'too_short' };
  if (digits.length > 13) return { valid: false, reason: 'too_long' };
  
  for (const pattern of FAKE_PATTERNS) {
    if (pattern.test(digits)) return { valid: false, reason: 'fake_pattern' };
  }
  
  let ddd = digits.slice(0, 2);
  if (digits.startsWith('55') && digits.length >= 12) {
    ddd = digits.slice(2, 4);
  }
  
  if (!VALID_DDDS.has(ddd)) {
    return { valid: false, reason: `invalid_ddd_${ddd}` };
  }
  
  return { valid: true };
}

async function main() {
  const sql = postgres(LEADS_DB);
  
  console.log("=== IDENTIFICAÇÃO DE TELEFONES INVÁLIDOS ===\n");
  
  const unenrichedLeads = await sql`
    SELECT 
      l.id,
      l.customer_phone,
      regexp_replace(l.customer_phone, '[^0-9]', '', 'g') as digits,
      e.id as enriched_id
    FROM c2s.leads l
    JOIN c2s.enriched_leads e ON l.id = e.lead_id
    WHERE e.enrichment_status IN ('unenriched', 'pending')
    AND l.customer_phone IS NOT NULL
    AND l.customer_phone != ''
  `;
  
  console.log(`Analyzing ${unenrichedLeads.length} leads...\n`);
  
  const invalidByReason: Record<string, Array<{id: string, phone: string, digits: string, enriched_id: string}>> = {};
  let validCount = 0;
  
  for (const lead of unenrichedLeads) {
    const result = isValidBrazilianPhone(lead.digits);
    if (!result.valid) {
      const reason = result.reason || 'unknown';
      if (!invalidByReason[reason]) invalidByReason[reason] = [];
      invalidByReason[reason].push(lead);
    } else {
      validCount++;
    }
  }
  
  console.log("=== INVALID PHONES ===\n");
  let totalInvalid = 0;
  for (const [reason, leads] of Object.entries(invalidByReason).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${reason}: ${leads.length}`);
    totalInvalid += leads.length;
  }
  
  console.log(`\nTotal invalid: ${totalInvalid}`);
  console.log(`Valid remaining: ${validCount}`);
  
  // Mark invalid leads using raw SQL
  console.log("\n=== MARKING INVALID ===\n");
  
  let marked = 0;
  for (const [reason, leads] of Object.entries(invalidByReason)) {
    for (const lead of leads) {
      const rawData = JSON.stringify({ invalid_reason: reason, original_phone: lead.customer_phone });
      await sql`
        UPDATE c2s.enriched_leads 
        SET enrichment_status = 'invalid_phone',
            work_api_raw = ${rawData}::jsonb
        WHERE id = ${lead.enriched_id}::uuid
      `;
      marked++;
    }
  }
  
  console.log(`Marked ${marked} leads as invalid_phone`);
  
  await sql.end();
}

main().catch(console.error);
