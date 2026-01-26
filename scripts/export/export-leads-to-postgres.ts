/**
 * Export all C2S leads to PostgreSQL
 * Uses aggressive rate limiting to avoid 429 errors
 * Saves progress to file for resume capability
 */

import { Client } from "pg";
import { existsSync, readFileSync, writeFileSync } from "fs";

const C2S_TOKEN = process.env.C2S_TOKEN || "";
const C2S_BASE_URL = "https://api.contact2sale.com";
const DB_URL =
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const PROGRESS_FILE = "/tmp/c2s-export-progress.json";

const PER_PAGE = 50; // C2S max is 50
const RATE_LIMIT_MS = 2000; // 2s between requests to be very safe
const RATE_LIMIT_WAIT_MS = 120000; // 2 min wait on rate limit

interface C2SLead {
  id: string;
  internal_id?: number;
  attributes?: {
    customer?: {
      name?: string;
      email?: string;
      phone?: string;
    };
    seller?: {
      name?: string;
      email?: string;
    };
    product?: {
      description?: string;
    };
    lead_source?: {
      name?: string;
    };
    channel?: {
      name?: string;
    };
    lead_status?: {
      alias?: string;
    };
    created_at?: string;
    updated_at?: string;
  };
}

interface Progress {
  lastPage: number;
  inserted: number;
  skipped: number;
  errors: number;
  timestamp: string;
}

function loadProgress(): Progress | null {
  try {
    if (existsSync(PROGRESS_FILE)) {
      return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
    }
  } catch {}
  return null;
}

function saveProgress(progress: Progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) {
    return digits.slice(2);
  }
  return digits || null;
}

async function fetchPage(
  page: number,
): Promise<{ leads: C2SLead[]; total: number }> {
  const url = `${C2S_BASE_URL}/integration/leads?page=${page}&perpage=${PER_PAGE}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${C2S_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 429) {
      throw new Error("RATE_LIMITED");
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 100)}`);
    }

    const data = await response.json();
    return {
      leads: data.data || [],
      total: data.meta?.total || 0,
    };
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      throw new Error("TIMEOUT");
    }
    throw error;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  C2S → PostgreSQL Export");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  if (!C2S_TOKEN) {
    console.error("❌ C2S_TOKEN not set");
    process.exit(1);
  }

  // Connect to PostgreSQL
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log("✅ Connected to PostgreSQL");

  // Get existing count
  const countResult = await db.query("SELECT COUNT(*) FROM c2s.leads");
  const existingCount = parseInt(countResult.rows[0].count);
  console.log(`📋 Existing leads in DB: ${existingCount}`);

  // Load progress or start fresh
  const savedProgress = loadProgress();
  let startPage = parseInt(process.env.START_PAGE || "1");
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  if (savedProgress && !process.env.START_PAGE) {
    console.log(`📁 Found saved progress from ${savedProgress.timestamp}`);
    console.log(
      `   Last page: ${savedProgress.lastPage}, Inserted: ${savedProgress.inserted}`,
    );
    startPage = savedProgress.lastPage + 1;
    inserted = savedProgress.inserted;
    skipped = savedProgress.skipped;
    errors = savedProgress.errors;
  }

  // Get total from C2S (with retry)
  let total = 0;
  let totalPages = 0;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const result = await fetchPage(1);
      total = result.total;
      totalPages = Math.ceil(total / PER_PAGE);
      break;
    } catch (error: any) {
      console.log(`⏳ Waiting to get total count (attempt ${attempt}/5)...`);
      await sleep(30000 * attempt);
    }
  }

  if (total === 0) {
    console.error(
      "❌ Could not get lead count from C2S. API may be rate limited.",
    );
    console.log("💡 Try again in a few minutes.");
    process.exit(1);
  }

  console.log(`📊 Total leads in C2S: ${total.toLocaleString()}`);
  console.log(`📄 Pages (${PER_PAGE}/page): ${totalPages}`);
  console.log(`⏱️  Rate limit: ${RATE_LIMIT_MS}ms between requests`);
  console.log(`🔄 Starting from page ${startPage}`);
  console.log("");

  let consecutiveErrors = 0;

  for (let page = startPage; page <= totalPages; page++) {
    try {
      const { leads } = await fetchPage(page);
      consecutiveErrors = 0;

      for (const lead of leads) {
        try {
          const result = await db.query(
            `INSERT INTO c2s.leads (
              id, internal_id, customer_name, customer_email, customer_phone,
              customer_phone_normalized, seller_name, seller_email,
              product_description, lead_source, channel, lead_status,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (id) DO NOTHING
            RETURNING id`,
            [
              lead.id,
              lead.internal_id || null,
              lead.attributes?.customer?.name || null,
              lead.attributes?.customer?.email || null,
              lead.attributes?.customer?.phone || null,
              normalizePhone(lead.attributes?.customer?.phone),
              lead.attributes?.seller?.name || null,
              lead.attributes?.seller?.email || null,
              lead.attributes?.product?.description || null,
              lead.attributes?.lead_source?.name || null,
              lead.attributes?.channel?.name || null,
              lead.attributes?.lead_status?.alias || null,
              lead.attributes?.created_at || null,
              lead.attributes?.updated_at || null,
            ],
          );

          if (result.rowCount && result.rowCount > 0) {
            inserted++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors++;
        }
      }

      // Save progress every 10 pages
      if (page % 10 === 0) {
        saveProgress({
          lastPage: page,
          inserted,
          skipped,
          errors,
          timestamp: new Date().toISOString(),
        });
      }

      // Progress update
      const progress = ((page / totalPages) * 100).toFixed(1);
      const totalProcessed = inserted + skipped;
      process.stdout.write(
        `\r📥 Page ${page}/${totalPages} (${progress}%) | New: ${inserted} | Skip: ${skipped} | Total: ${totalProcessed}   `,
      );

      // Rate limit
      await sleep(RATE_LIMIT_MS);
    } catch (error: any) {
      consecutiveErrors++;

      if (error.message === "RATE_LIMITED" || error.message === "TIMEOUT") {
        const waitTime = RATE_LIMIT_WAIT_MS * consecutiveErrors;
        console.log(
          `\n⏳ ${error.message} on page ${page}. Waiting ${waitTime / 1000}s... (consecutive errors: ${consecutiveErrors})`,
        );

        // Save progress before waiting
        saveProgress({
          lastPage: page - 1,
          inserted,
          skipped,
          errors,
          timestamp: new Date().toISOString(),
        });

        await sleep(waitTime);
        page--; // Retry this page

        if (consecutiveErrors >= 5) {
          console.log(
            `\n🛑 Too many consecutive errors. Stopping at page ${page}.`,
          );
          console.log(
            `💡 Resume with: bun run scripts/export-leads-to-postgres.ts`,
          );
          console.log(
            `   Or override: START_PAGE=${page} bun run scripts/export-leads-to-postgres.ts`,
          );
          break;
        }
      } else {
        console.error(`\n❌ Error on page ${page}: ${error.message}`);
        errors++;
        await sleep(5000);
      }
    }
  }

  // Final stats
  const finalResult = await db.query("SELECT COUNT(*) FROM c2s.leads");
  console.log("\n");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  ✅ EXPORT COMPLETE");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(`  📊 Total in DB: ${finalResult.rows[0].count}`);
  console.log(`  ✅ New inserts: ${inserted}`);
  console.log(`  ⏭️  Skipped (duplicates): ${skipped}`);
  console.log(`  ❌ Errors: ${errors}`);
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  // Clear progress file on success
  if (existsSync(PROGRESS_FILE)) {
    writeFileSync(
      PROGRESS_FILE,
      JSON.stringify({ completed: true, timestamp: new Date().toISOString() }),
    );
  }

  await db.end();
}

main().catch(console.error);
