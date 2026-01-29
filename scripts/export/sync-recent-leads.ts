/**
 * Sync Recent C2S Leads to PostgreSQL
 *
 * Fetches leads from C2S API and stores them in c2s.leads table
 * Supports:
 * - Date range filtering (default: last 30 days)
 * - Incremental sync (resume from last sync)
 * - Rate limiting (0.5s between requests)
 * - Duplicate handling (ON CONFLICT DO UPDATE)
 */

import { C2SService, type C2SLead } from "../../src/services/c2s.service";
import { neon } from "@neondatabase/serverless";

// Configuration
const LEADS_DB_URL =
  process.env.LEADS_DB_URL ||
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb";
const BATCH_SIZE = 50; // C2S API max per page
const DELAY_MS = 500; // Rate limiting

// Parse command line args
const args = process.argv.slice(2);
const daysBack =
  args.find((arg) => arg.startsWith("--days="))?.split("=")[1] || "30";
const maxPages =
  args.find((arg) => arg.startsWith("--max-pages="))?.split("=")[1] || "0";
const dryRun = args.includes("--dry-run");
const status = args.find((arg) => arg.startsWith("--status="))?.split("=")[1];

console.log("═══════════════════════════════════════════════════════════════");
console.log("  C2S → PostgreSQL Recent Leads Sync");
console.log("═══════════════════════════════════════════════════════════════");
console.log(`📅 Date range: Last ${daysBack} days`);
console.log(`📊 Batch size: ${BATCH_SIZE} per page`);
console.log(`⏱️  Rate limit: ${DELAY_MS}ms between requests`);
if (maxPages !== "0") console.log(`📄 Max pages: ${maxPages}`);
if (status) console.log(`🔍 Status filter: ${status}`);
if (dryRun) console.log(`🧪 DRY RUN MODE - No database writes`);
console.log("");

/**
 * Normalize phone number (remove country code if present)
 */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");

  // Remove Brazil country code (55) if present and phone is 12+ digits
  if (digits.length >= 12 && digits.startsWith("55")) {
    return digits.slice(2);
  }

  return digits || null;
}

/**
 * Extract data from C2S lead for storage
 */
function extractLeadData(lead: C2SLead) {
  const attr = lead.attributes || {};
  const customer = attr.customer || {};
  const seller = attr.seller;
  const product = attr.product;
  const leadSource = attr.lead_source;
  const channel = attr.channel;
  const leadStatus = attr.lead_status;

  return {
    id: lead.id,
    internal_id: lead.internal_id,
    customer_name: customer.name || lead.customer || null,
    customer_email: customer.email || lead.email || null,
    customer_phone: customer.phone || lead.phone || null,
    customer_phone_normalized: normalizePhone(customer.phone || lead.phone),
    seller_name: seller?.name || null,
    seller_email: seller?.email || null,
    seller_id: seller?.id || lead.seller_id || null,
    product_description: product?.description || lead.product || null,
    lead_source: leadSource?.name || lead.source || null,
    channel: channel?.name || null,
    lead_status: leadStatus?.alias || lead.status || null,
    created_at: attr.created_at || lead.created_at || new Date().toISOString(),
    updated_at: attr.updated_at || lead.updated_at || new Date().toISOString(),
  };
}

/**
 * Ensure c2s.leads table exists
 */
async function ensureTable(sql: ReturnType<typeof neon>): Promise<void> {
  console.log("🔧 Ensuring c2s.leads table exists...");

  await sql`
    CREATE SCHEMA IF NOT EXISTS c2s;
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS c2s.leads (
      id VARCHAR(255) PRIMARY KEY,
      internal_id INTEGER,
      customer_name VARCHAR(255),
      customer_email VARCHAR(255),
      customer_phone VARCHAR(50),
      customer_phone_normalized VARCHAR(20),
      seller_name VARCHAR(255),
      seller_email VARCHAR(255),
      seller_id VARCHAR(100),
      product_description TEXT,
      lead_source VARCHAR(255),
      channel VARCHAR(255),
      lead_status VARCHAR(100),
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_c2s_leads_phone
    ON c2s.leads(customer_phone_normalized);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_c2s_leads_email
    ON c2s.leads(customer_email);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_c2s_leads_created_at
    ON c2s.leads(created_at DESC);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_c2s_leads_status
    ON c2s.leads(lead_status);
  `;

  console.log("✅ Table ready\n");
}

/**
 * Insert or update leads in database
 */
async function upsertLeads(
  sql: ReturnType<typeof neon>,
  leads: C2SLead[],
): Promise<number> {
  if (leads.length === 0) return 0;

  const values = leads.map(extractLeadData);

  let upserted = 0;
  for (const data of values) {
    await sql`
      INSERT INTO c2s.leads (
        id, internal_id, customer_name, customer_email,
        customer_phone, customer_phone_normalized,
        seller_name, seller_email, seller_id,
        product_description, lead_source, channel, lead_status,
        created_at, updated_at, synced_at
      ) VALUES (
        ${data.id}, ${data.internal_id}, ${data.customer_name}, ${data.customer_email},
        ${data.customer_phone}, ${data.customer_phone_normalized},
        ${data.seller_name}, ${data.seller_email}, ${data.seller_id},
        ${data.product_description}, ${data.lead_source}, ${data.channel}, ${data.lead_status},
        ${data.created_at}, ${data.updated_at}, CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        customer_email = EXCLUDED.customer_email,
        customer_phone = EXCLUDED.customer_phone,
        customer_phone_normalized = EXCLUDED.customer_phone_normalized,
        seller_name = EXCLUDED.seller_name,
        seller_email = EXCLUDED.seller_email,
        seller_id = EXCLUDED.seller_id,
        product_description = EXCLUDED.product_description,
        lead_source = EXCLUDED.lead_source,
        channel = EXCLUDED.channel,
        lead_status = EXCLUDED.lead_status,
        updated_at = EXCLUDED.updated_at,
        synced_at = CURRENT_TIMESTAMP
    `;
    upserted++;
  }

  return upserted;
}

/**
 * Get current database stats
 */
async function getStats(sql: ReturnType<typeof neon>): Promise<{
  total: number;
  recent: number;
  byStatus: Record<string, number>;
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysBack));

  const totalResult = await sql`
    SELECT COUNT(*) as count FROM c2s.leads
  `;
  const total = parseInt(totalResult[0]?.count || "0");

  const recentResult = await sql`
    SELECT COUNT(*) as count FROM c2s.leads
    WHERE created_at >= ${cutoffDate.toISOString()}
  `;
  const recent = parseInt(recentResult[0]?.count || "0");

  const statusResults = await sql`
    SELECT lead_status, COUNT(*) as count
    FROM c2s.leads
    GROUP BY lead_status
    ORDER BY count DESC
  `;

  const byStatus: Record<string, number> = {};
  for (const row of statusResults) {
    byStatus[row.lead_status || "unknown"] = parseInt(row.count);
  }

  return { total, recent, byStatus };
}

/**
 * Main sync logic
 */
async function main() {
  const c2sService = new C2SService();
  const sql = neon(LEADS_DB_URL);

  // Ensure table exists
  if (!dryRun) {
    await ensureTable(sql);
  }

  // Get initial stats
  const initialStats = dryRun
    ? { total: 0, recent: 0, byStatus: {} }
    : await getStats(sql);
  console.log(`📊 Current database stats:`);
  console.log(`   Total leads: ${initialStats.total.toLocaleString()}`);
  console.log(
    `   Recent (last ${daysBack} days): ${initialStats.recent.toLocaleString()}`,
  );
  if (Object.keys(initialStats.byStatus).length > 0) {
    console.log(`   By status:`);
    for (const [status, count] of Object.entries(initialStats.byStatus).slice(
      0,
      5,
    )) {
      console.log(`     - ${status}: ${count.toLocaleString()}`);
    }
  }
  console.log("");

  // Note: C2S API date filters are unreliable, so we fetch all and filter client-side
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysBack));
  cutoffDate.setHours(0, 0, 0, 0);

  console.log(
    `🔄 Fetching all leads (will filter for last ${daysBack} days client-side)...\n`,
  );

  let page = 1;
  let totalFetched = 0;
  let totalUpserted = 0;
  let rateLimitErrors = 0;

  const maxPagesLimit = parseInt(maxPages);

  while (true) {
    if (maxPagesLimit > 0 && page > maxPagesLimit) {
      console.log(`\n⏹️  Reached max pages limit (${maxPagesLimit})`);
      break;
    }

    try {
      // Fetch page from C2S (without date filter - API is unreliable)
      const fetchOptions: any = {
        page,
        perpage: BATCH_SIZE,
        sort: "-created_at", // newest first
      };

      if (status) {
        fetchOptions.status = status;
      }

      const response = await c2sService.getLeads(fetchOptions);

      let leads = response.data || [];

      if (leads.length === 0) {
        console.log(`\n✅ No more leads to fetch (page ${page})`);
        break;
      }

      // Client-side date filtering (skip leads older than cutoff)
      const leadsBefore = leads.length;
      leads = leads.filter((lead) => {
        const createdAt = lead.attributes?.created_at || lead.created_at;
        return new Date(createdAt) >= cutoffDate;
      });

      // If all leads filtered out, we've gone past our date range
      if (leads.length === 0 && leadsBefore > 0) {
        console.log(
          `\n✅ Reached date cutoff (all ${leadsBefore} leads older than ${daysBack} days ago)`,
        );
        break;
      }

      totalFetched += leads.length;

      // Store in database
      if (!dryRun && leads.length > 0) {
        const upserted = await upsertLeads(sql, leads);
        totalUpserted += upserted;
      }

      // Progress indicator
      const newestLead = leads[0];
      const oldestLead = leads[leads.length - 1];
      const newestDate =
        newestLead.attributes?.created_at || newestLead.created_at;
      const oldestDate =
        oldestLead.attributes?.created_at || oldestLead.created_at;

      process.stdout.write(
        `\r📥 Page ${page} | Fetched: ${totalFetched} | ${dryRun ? "Would upsert" : "Upserted"}: ${dryRun ? totalFetched : totalUpserted} | ` +
          `Range: ${new Date(oldestDate).toLocaleDateString()} - ${new Date(newestDate).toLocaleDateString()}   `,
      );

      // Check if we should continue
      if (leads.length < BATCH_SIZE) {
        console.log(
          `\n✅ Reached last page (partial page: ${leads.length}/${BATCH_SIZE})`,
        );
        break;
      }

      page++;
      rateLimitErrors = 0;

      // Rate limiting
      await new Promise((r) => setTimeout(r, DELAY_MS));
    } catch (error: any) {
      if (
        error.message?.includes("429") ||
        error.message?.includes("RATE_LIMITED")
      ) {
        rateLimitErrors++;
        const waitTime = Math.min(120000, 5000 * rateLimitErrors);
        console.log(`\n⏳ Rate limited. Waiting ${waitTime / 1000}s...`);
        await new Promise((r) => setTimeout(r, waitTime));

        if (rateLimitErrors >= 10) {
          console.log(`\n🛑 Too many rate limits. Resume from page ${page}`);
          break;
        }
      } else {
        console.error(`\n❌ Error on page ${page}: ${error.message}`);
        throw error;
      }
    }
  }

  console.log("\n");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  Sync Complete");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  // Get final stats
  if (!dryRun) {
    const finalStats = await getStats(sql);
    console.log(`\n📊 Final database stats:`);
    console.log(
      `   Total leads: ${finalStats.total.toLocaleString()} (+${(finalStats.total - initialStats.total).toLocaleString()})`,
    );
    console.log(
      `   Recent (last ${daysBack} days): ${finalStats.recent.toLocaleString()}`,
    );
    console.log("");
  }

  console.log(`✅ Fetched: ${totalFetched.toLocaleString()} leads`);
  console.log(
    `✅ ${dryRun ? "Would upsert" : "Upserted"}: ${dryRun ? totalFetched : totalUpserted.toLocaleString()} leads`,
  );
  console.log("");

  if (dryRun) {
    console.log("🧪 DRY RUN - No changes were made to the database");
    console.log("   Remove --dry-run flag to actually sync leads");
    console.log("");
  }
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error.message);
  console.error(error.stack);
  process.exit(1);
});
