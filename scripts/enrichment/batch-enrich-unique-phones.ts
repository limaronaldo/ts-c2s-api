/**
 * Batch Enrichment - Unique Phones Only (No C2S Updates)
 *
 * Optimized version that:
 * 1. Gets unique phones NOT yet enriched
 * 2. Enriches ONE lead per unique phone
 * 3. After enrichment, copies results to all leads with same phone
 *
 * This avoids duplicate API calls for leads with the same phone number.
 *
 * Usage:
 *   bun scripts/batch-enrich-unique-phones.ts [--limit N] [--delay MS]
 */

import { execSync } from "child_process";

const API_URL = "https://ts-c2s-api.fly.dev";
const DUCKDB_PATH = "./exports/leads.duckdb";
const PROGRESS_LOG_INTERVAL = 25;

// Parse command line args
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const delayArg = args.find((a) => a.startsWith("--delay="));

const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 1000;
const delayMs = delayArg ? parseInt(delayArg.split("=")[1]) : 2500;

// Stats
const stats = {
  processed: 0,
  completed: 0,
  partial: 0,
  unenriched: 0,
  failed: 0,
  apiErrors: 0,
  duplicatesCopied: 0,
  startTime: Date.now(),
};

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

interface EnrichmentResponse {
  data?: {
    success: boolean;
    leadId: string;
    enrichmentStatus: string;
    cpf?: string;
    cpfSource?: string;
    name?: string;
    income?: number;
    presumedIncome?: number;
    birthDate?: string;
    gender?: string;
    motherName?: string;
    occupation?: string;
    education?: string;
    maritalStatus?: string;
    phones?: string[];
    emails?: string[];
    addresses?: Array<{
      street?: string;
      number?: string;
      complement?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      zip?: string;
    }>;
    partyId?: string;
    error?: string;
  };
  error?: string;
}

function duckQuery(sql: string): string {
  try {
    const escaped = sql.replace(/"/g, '\\"');
    return execSync(`duckdb "${DUCKDB_PATH}" -json -c "${escaped}"`, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (error: any) {
    console.error("DuckDB query failed:", error.message);
    return "[]";
  }
}

function duckExec(sql: string): boolean {
  try {
    const escaped = sql.replace(/"/g, '\\"').replace(/\$/g, "\\$");
    execSync(`duckdb "${DUCKDB_PATH}" -c "${escaped}"`, { encoding: "utf-8" });
    return true;
  } catch (error: any) {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeSql(value: string | null | undefined): string {
  if (!value) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

async function callEnrichApi(lead: Lead): Promise<EnrichmentResponse> {
  const body: Record<string, string> = {
    leadId: lead.id,
    name: lead.name,
  };
  if (lead.phone) body.phone = lead.phone;
  if (lead.email) body.email = lead.email;

  try {
    const response = await fetch(`${API_URL}/enrich-db-only`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      if (response.status === 429) return { error: "rate_limited" };
      const text = await response.text();
      return { error: `HTTP ${response.status}: ${text.substring(0, 100)}` };
    }

    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
}

function storeToDuckDb(leadId: string, phone: string, data: EnrichmentResponse["data"]): void {
  if (!data) return;

  const phones = data.phones?.length ? JSON.stringify(data.phones) : "NULL";
  const emails = data.emails?.length ? JSON.stringify(data.emails) : "NULL";
  const addresses = data.addresses?.length ? JSON.stringify(data.addresses) : "NULL";

  const sql = `
    INSERT OR REPLACE INTO enriched_leads (
      lead_id, cpf, enriched_name, birth_date, gender, mother_name,
      income, presumed_income, occupation, education, marital_status,
      phones, emails, addresses, cpf_source, enrichment_status, enriched_at
    ) VALUES (
      ${escapeSql(leadId)},
      ${escapeSql(data.cpf)},
      ${escapeSql(data.name)},
      ${escapeSql(data.birthDate)},
      ${escapeSql(data.gender)},
      ${escapeSql(data.motherName)},
      ${data.income || "NULL"},
      ${data.presumedIncome || "NULL"},
      ${escapeSql(data.occupation)},
      ${escapeSql(data.education)},
      ${escapeSql(data.maritalStatus)},
      ${phones === "NULL" ? "NULL" : `'${phones.replace(/'/g, "''")}'`},
      ${emails === "NULL" ? "NULL" : `'${emails.replace(/'/g, "''")}'`},
      ${addresses === "NULL" ? "NULL" : `'${addresses.replace(/'/g, "''")}'`},
      ${escapeSql(data.cpfSource)},
      ${escapeSql(data.enrichmentStatus)},
      CURRENT_TIMESTAMP
    )
  `;
  duckExec(sql);
}

/**
 * Copy enrichment data to all other leads with the same phone
 */
function copyToSamePhone(phone: string, sourceLeadId: string): number {
  const countSql = `
    SELECT COUNT(*) as cnt FROM leads l
    LEFT JOIN enriched_leads e ON l.id = e.lead_id
    WHERE l.customer.phone = '${phone}'
      AND e.lead_id IS NULL
      AND l.id != '${sourceLeadId}'
  `;
  const countResult = JSON.parse(duckQuery(countSql));
  const count = countResult[0]?.cnt || 0;

  if (count === 0) return 0;

  const copySql = `
    INSERT INTO enriched_leads (
      lead_id, cpf, enriched_name, birth_date, gender, mother_name,
      income, presumed_income, occupation, education, marital_status,
      phones, emails, addresses, cpf_source, enrichment_status, enriched_at
    )
    SELECT
      l.id,
      e.cpf, e.enriched_name, e.birth_date, e.gender, e.mother_name,
      e.income, e.presumed_income, e.occupation, e.education, e.marital_status,
      e.phones, e.emails, e.addresses,
      'copied-from-phone',
      e.enrichment_status,
      CURRENT_TIMESTAMP
    FROM leads l
    CROSS JOIN enriched_leads e
    LEFT JOIN enriched_leads existing ON l.id = existing.lead_id
    WHERE l.customer.phone = '${phone}'
      AND e.lead_id = '${sourceLeadId}'
      AND existing.lead_id IS NULL
      AND l.id != '${sourceLeadId}'
  `;
  duckExec(copySql);

  return count;
}

function printProgress(total: number): void {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = stats.processed / elapsed;
  const remaining = total - stats.processed;
  const eta = remaining / rate;

  console.log(`\n${"─".repeat(70)}`);
  console.log(`📊 Progress: ${stats.processed}/${total} unique phones (${((stats.processed / total) * 100).toFixed(1)}%)`);
  console.log(`   ✅ Completed: ${stats.completed} | 🟡 Partial: ${stats.partial} | ⚪ Unenriched: ${stats.unenriched}`);
  console.log(`   📋 Duplicates copied: ${stats.duplicatesCopied}`);
  console.log(`   ⏱️ Rate: ${(rate * 60).toFixed(1)}/min | ETA: ${(eta / 60).toFixed(1)} min`);
  console.log(`${"─".repeat(70)}\n`);
}

async function main() {
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log("🔄 BATCH ENRICHMENT - UNIQUE PHONES ONLY (No C2S Updates)");
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log(`   API: ${API_URL}/enrich-db-only`);
  console.log(`   Limit: ${limit} unique phones | Delay: ${delayMs}ms`);
  console.log("══════════════════════════════════════════════════════════════════════\n");

  // Get ONE lead per unique phone that hasn't been enriched yet
  console.log("📋 Fetching unique phones not yet enriched...");
  const query = `
    WITH enriched_phones AS (
      SELECT DISTINCT l.customer.phone as phone
      FROM enriched_leads e
      JOIN leads l ON e.lead_id = l.id
      WHERE l.customer.phone IS NOT NULL
    ),
    unenriched_unique_phones AS (
      SELECT
        l.customer.phone as phone,
        FIRST(l.id) as lead_id,
        FIRST(l.customer.name) as name,
        FIRST(l.customer.email) as email
      FROM leads l
      WHERE l.customer.phone IS NOT NULL
        AND l.customer.phone != ''
        AND l.customer.name IS NOT NULL
        AND l.customer.name != ''
        AND l.customer.phone NOT IN (SELECT phone FROM enriched_phones)
      GROUP BY l.customer.phone
    )
    SELECT lead_id as id, name, phone, email
    FROM unenriched_unique_phones
    LIMIT ${limit}
  `;

  const leadsJson = duckQuery(query);
  const leads: Lead[] = JSON.parse(leadsJson);
  console.log(`   Found ${leads.length} unique phones to enrich\n`);

  if (leads.length === 0) {
    console.log("✅ No unique phones left to enrich!");
    return;
  }

  console.log("🚀 Starting enrichment...\n");

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const progress = `[${(i + 1).toString().padStart(4)}/${leads.length}]`;
    const displayName = (lead.name || "Unknown").substring(0, 25).padEnd(25);

    process.stdout.write(`${progress} ${displayName} `);

    // Handle rate limiting
    let result = await callEnrichApi(lead);
    if (result.error === "rate_limited") {
      console.log("⏳ Rate limited, waiting 60s...");
      await sleep(60000);
      result = await callEnrichApi(lead);
    }

    if (result.error) {
      stats.apiErrors++;
      stats.failed++;
      console.log(`❌ ${result.error.substring(0, 35)}`);
      storeToDuckDb(lead.id, lead.phone, {
        success: false,
        leadId: lead.id,
        enrichmentStatus: "failed",
      });
    } else if (result.data) {
      const data = result.data;
      storeToDuckDb(lead.id, lead.phone, data);

      // Copy to other leads with same phone
      const copied = copyToSamePhone(lead.phone, lead.id);
      stats.duplicatesCopied += copied;

      switch (data.enrichmentStatus) {
        case "completed":
          stats.completed++;
          const incomeStr = data.income
            ? `R$${data.income.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
            : "no income";
          console.log(`✅ ${data.cpf || "?"} (${incomeStr})${copied > 0 ? ` +${copied} copies` : ""}`);
          break;
        case "partial":
          stats.partial++;
          console.log(`🟡 ${data.cpf || "?"} (partial)${copied > 0 ? ` +${copied} copies` : ""}`);
          break;
        case "unenriched":
          stats.unenriched++;
          console.log(`⚪ CPF not found${copied > 0 ? ` +${copied} copies` : ""}`);
          break;
        default:
          stats.failed++;
          console.log(`❓ ${data.enrichmentStatus}`);
      }
    }

    stats.processed++;

    if (stats.processed % PROGRESS_LOG_INTERVAL === 0) {
      printProgress(leads.length);
    }

    if (i < leads.length - 1) {
      await sleep(delayMs);
    }
  }

  // Final stats
  console.log("\n" + "══════════════════════════════════════════════════════════════════════");
  console.log("📊 FINAL RESULTS");
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log(`   Unique phones processed: ${stats.processed}`);
  console.log(`   ✅ Completed: ${stats.completed} (${((stats.completed / stats.processed) * 100).toFixed(1)}%)`);
  console.log(`   🟡 Partial: ${stats.partial}`);
  console.log(`   ⚪ Unenriched: ${stats.unenriched}`);
  console.log(`   ❌ Failed: ${stats.failed}`);
  console.log(`   📋 Duplicates auto-copied: ${stats.duplicatesCopied}`);

  const totalLeadsProcessed = stats.processed + stats.duplicatesCopied;
  console.log(`   📈 Total leads covered: ${totalLeadsProcessed}`);

  const elapsed = (Date.now() - stats.startTime) / 1000;
  console.log(`   ⏱️ Duration: ${(elapsed / 60).toFixed(1)} minutes`);
  console.log("══════════════════════════════════════════════════════════════════════");

  // Show DuckDB stats
  console.log("\n📦 DuckDB enriched_leads:");
  const dbStats = JSON.parse(duckQuery("SELECT enrichment_status, COUNT(*) as n FROM enriched_leads GROUP BY 1 ORDER BY 2 DESC"));
  for (const row of dbStats) {
    console.log(`   ${row.enrichment_status}: ${row.n}`);
  }

  console.log("\n✅ Done! NO messages sent to C2S.");
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err);
  process.exit(1);
});
