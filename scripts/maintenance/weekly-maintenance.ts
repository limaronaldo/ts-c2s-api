/**
 * Weekly Maintenance Script
 *
 * Runs the following maintenance tasks:
 * 1. Normalize phones with duplicate DDD 55 prefix
 * 2. Flag invalid phone numbers
 * 3. Report current enrichment status
 *
 * Run manually: bun run scripts/maintenance/weekly-maintenance.ts
 * Or via cron every Sunday at 3 AM:
 * 0 3 * * 0 cd /path/to/ts-c2s-api && bun run scripts/maintenance/weekly-maintenance.ts
 */
import postgres from "postgres";

const LEADS_DB = "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";

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

function isValidPhone(digits: string): { valid: boolean; reason?: string } {
  if (digits.length < 10) return { valid: false, reason: 'too_short' };
  if (digits.length > 13) return { valid: false, reason: 'too_long' };
  for (const p of FAKE_PATTERNS) if (p.test(digits)) return { valid: false, reason: 'fake' };
  let ddd = digits.slice(0, 2);
  if (digits.startsWith('55') && digits.length >= 12) ddd = digits.slice(2, 4);
  if (!VALID_DDDS.has(ddd)) return { valid: false, reason: `invalid_ddd_${ddd}` };
  return { valid: true };
}

async function main() {
  const start = Date.now();
  const sql = postgres(LEADS_DB);
  
  console.log("═".repeat(60));
  console.log(`WEEKLY MAINTENANCE - ${new Date().toISOString()}`);
  console.log("═".repeat(60) + "\n");

  // Task 1: Normalize DDD 55
  console.log("► Task 1: Normalize phones with 55 prefix");
  const toNormalize = await sql`
    SELECT l.id, regexp_replace(l.customer_phone, '[^0-9]', '', 'g') as digits, e.id as eid
    FROM c2s.leads l JOIN c2s.enriched_leads e ON l.id = e.lead_id
    WHERE e.enrichment_status IN ('unenriched', 'pending')
    AND length(regexp_replace(l.customer_phone, '[^0-9]', '', 'g')) >= 12
    AND regexp_replace(l.customer_phone, '[^0-9]', '', 'g') LIKE '55%'
  `;
  let normalized = 0;
  for (const r of toNormalize) {
    const norm = r.digits.slice(2);
    const ddd = norm.slice(0, 2);
    if (VALID_DDDS.has(ddd)) {
      await sql`UPDATE c2s.leads SET customer_phone_normalized = ${norm} WHERE id = ${r.id}`;
      await sql`UPDATE c2s.enriched_leads SET enrichment_status = 'pending' WHERE id = ${r.eid}::uuid`;
      normalized++;
    }
  }
  console.log(`  ✓ Normalized: ${normalized}\n`);

  // Task 2: Flag invalid phones
  console.log("► Task 2: Flag invalid phones");
  const toCheck = await sql`
    SELECT l.customer_phone as phone, regexp_replace(l.customer_phone, '[^0-9]', '', 'g') as digits, e.id as eid
    FROM c2s.leads l JOIN c2s.enriched_leads e ON l.id = e.lead_id
    WHERE e.enrichment_status IN ('unenriched', 'pending') AND l.customer_phone IS NOT NULL
  `;
  let flagged = 0;
  for (const r of toCheck) {
    const v = isValidPhone(r.digits);
    if (!v.valid) {
      await sql`UPDATE c2s.enriched_leads SET enrichment_status = 'invalid_phone', 
        work_api_raw = ${JSON.stringify({invalid_reason: v.reason, phone: r.phone})}::jsonb WHERE id = ${r.eid}::uuid`;
      flagged++;
    }
  }
  console.log(`  ✓ Flagged: ${flagged}\n`);

  // Task 3: Status report
  console.log("► Task 3: Status Report");
  const stats = await sql`SELECT enrichment_status, COUNT(*)::int as c FROM c2s.enriched_leads GROUP BY 1 ORDER BY 2 DESC`;
  let total = 0, enriched = 0, invalid = 0;
  for (const s of stats) {
    total += s.c;
    if (s.enrichment_status === 'completed' || s.enrichment_status === 'partial') enriched += s.c;
    if (s.enrichment_status === 'invalid_phone') invalid += s.c;
    console.log(`  ${(s.enrichment_status || 'null').padEnd(15)} ${s.c}`);
  }
  const rate = ((enriched / (total - invalid)) * 100).toFixed(1);
  console.log(`  ${"─".repeat(25)}`);
  console.log(`  Rate: ${rate}% (${enriched}/${total - invalid})\n`);

  console.log("═".repeat(60));
  console.log(`DONE in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  console.log("═".repeat(60));
  
  await sql.end();
}

main().catch(console.error);
