/**
 * Export C2S leads to PostgreSQL using psql command
 * This writes SQL to a file and executes via psql for guaranteed commits
 */

import { writeFileSync, appendFileSync, unlinkSync, existsSync } from "fs";
import { execSync } from "child_process";

const C2S_TOKEN = process.env.C2S_TOKEN || "";
const C2S_URL = "https://api.contact2sale.com/integration/leads";
// Use direct endpoint, not pooler (pooler causes connection issues)
const PSQL_CMD = `PGPASSWORD=npg_quYSE3haoz2e psql 'postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require'`;
const BATCH_SIZE = 100;
const DELAY_MS = 5000;
const SQL_FILE = "/tmp/c2s_leads.sql";

function escapeString(str: string | null): string {
  if (str === null || str === undefined) return "NULL";
  return `'${str.replace(/'/g, "''")}'`;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) {
    return digits.slice(2);
  }
  return digits || null;
}

async function fetchLeadsPage(
  page: number,
): Promise<{ leads: any[]; total: number }> {
  const url = `${C2S_URL}?limit=${BATCH_SIZE}&page=${page}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${C2S_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 429) {
    throw new Error("RATE_LIMITED");
  }

  if (!response.ok) {
    throw new Error(`C2S API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    leads: data.data || [],
    total: data.meta?.total || 0,
  };
}

function getCurrentCount(): number {
  try {
    const result = execSync(
      `${PSQL_CMD} -t -c "SELECT COUNT(*) FROM c2s.leads;"`,
      { encoding: "utf8" },
    );
    return parseInt(result.trim()) || 0;
  } catch {
    return 0;
  }
}

function executeSqlFile(): boolean {
  try {
    execSync(`${PSQL_CMD} -f ${SQL_FILE}`, {
      encoding: "utf8",
      timeout: 60000,
    });
    return true;
  } catch (err: any) {
    console.error(`\n❌ SQL execution error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  C2S → PostgreSQL Export (PSQL Version)");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  if (!C2S_TOKEN) {
    console.error("❌ C2S_TOKEN not set");
    process.exit(1);
  }

  const existingCount = getCurrentCount();
  console.log(`📋 Existing leads: ${existingCount}`);

  const { total } = await fetchLeadsPage(1);
  const totalPages = Math.ceil(total / BATCH_SIZE);
  console.log(`📊 Total in C2S: ${total.toLocaleString()}`);

  // Start from page 42 (pages 1-41 have been checked and their leads exist)
  const startPage = parseInt(process.env.START_PAGE || "42", 10);
  console.log(`🔄 Starting from page ${startPage}`);

  let inserted = 0;
  let rateLimitErrors = 0;

  for (let page = startPage; page <= totalPages; page++) {
    try {
      const { leads } = await fetchLeadsPage(page);

      // Write SQL file for this batch
      if (existsSync(SQL_FILE)) unlinkSync(SQL_FILE);

      for (const lead of leads) {
        const sql = `INSERT INTO c2s.leads (id, internal_id, customer_name, customer_email, customer_phone, customer_phone_normalized, seller_name, seller_email, product_description, lead_source, channel, lead_status, created_at, updated_at) VALUES (${escapeString(lead.id)}, ${lead.internal_id || "NULL"}, ${escapeString(lead.attributes?.customer?.name)}, ${escapeString(lead.attributes?.customer?.email)}, ${escapeString(lead.attributes?.customer?.phone)}, ${escapeString(normalizePhone(lead.attributes?.customer?.phone))}, ${escapeString(lead.attributes?.seller?.name)}, ${escapeString(lead.attributes?.seller?.email)}, ${escapeString(lead.attributes?.product?.description)}, ${escapeString(lead.attributes?.lead_source?.name)}, ${escapeString(lead.attributes?.channel?.name)}, ${escapeString(lead.attributes?.lead_status?.alias)}, ${escapeString(lead.attributes?.created_at)}, ${escapeString(lead.attributes?.updated_at)}) ON CONFLICT (id) DO NOTHING;\n`;

        appendFileSync(SQL_FILE, sql);
      }

      // Execute the SQL file
      if (executeSqlFile()) {
        inserted += leads.length;
        rateLimitErrors = 0;
      }

      process.stdout.write(
        `\r📥 Page ${page}/${totalPages} | Inserted: ${inserted}   `,
      );

      await new Promise((r) => setTimeout(r, DELAY_MS));
    } catch (error: any) {
      if (error.message === "RATE_LIMITED") {
        rateLimitErrors++;
        const waitTime = Math.min(120000, 20000 * rateLimitErrors);
        console.log(`\n⏳ Rate limited. Waiting ${waitTime / 1000}s...`);
        await new Promise((r) => setTimeout(r, waitTime));
        page--;
        if (rateLimitErrors >= 10) {
          console.log(`\n🛑 Too many rate limits. Resume from page ${page}`);
          break;
        }
      } else {
        console.error(`\n❌ Error: ${error.message}`);
      }
    }
  }

  const finalCount = getCurrentCount();
  console.log(`\n\n✅ Final count: ${finalCount}`);

  if (existsSync(SQL_FILE)) unlinkSync(SQL_FILE);
}

main().catch(console.error);
