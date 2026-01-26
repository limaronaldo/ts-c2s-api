/**
 * Enrich Leads via Deployed API
 *
 * Calls the ts-c2s-api on Fly.io to enrich leads from leads-mb database.
 * The deployed API has access to CPF discovery services (DBase, Diretrix).
 *
 * Usage:
 *   bun run scripts/enrich-via-api.ts
 *
 * Control:
 *   - To PAUSE: touch /tmp/enrich-pause
 *   - To RESUME: rm /tmp/enrich-pause
 *   - To STOP: touch /tmp/enrich-stop
 */

import { Client } from "pg";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";

const API_URL = "https://ts-c2s-api.fly.dev";
const LEADS_DB_URL =
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const PROGRESS_FILE = "/tmp/enrich-api-progress.json";
const PAUSE_FILE = "/tmp/enrich-pause";
const STOP_FILE = "/tmp/enrich-stop";

const DELAY_MS = 3000; // 3 seconds between API calls to avoid rate limiting
const SAVE_INTERVAL = 10;

interface Progress {
  processedCount: number;
  successCount: number;
  failedCount: number;
  partialCount: number;
  lastLeadId: string | null;
  startedAt: string;
  lastUpdated: string;
  status: "running" | "paused" | "stopped" | "completed";
}

function loadProgress(): Progress {
  try {
    if (existsSync(PROGRESS_FILE)) {
      return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
    }
  } catch {}
  return {
    processedCount: 0,
    successCount: 0,
    failedCount: 0,
    partialCount: 0,
    lastLeadId: null,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    status: "running",
  };
}

function saveProgress(progress: Progress) {
  progress.lastUpdated = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldPause(): boolean {
  return existsSync(PAUSE_FILE);
}

function shouldStop(): boolean {
  return existsSync(STOP_FILE);
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

interface Lead {
  id: string;
  customer_name: string;
  customer_phone_normalized: string;
  customer_email: string | null;
}

interface EnrichResult {
  status: string;
  error?: string;
  data?: any;
}

async function enrichViaApi(lead: Lead): Promise<EnrichResult> {
  try {
    const response = await fetch(`${API_URL}/batch/enrich-direct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: lead.customer_phone_normalized,
        email: lead.customer_email || undefined,
        name: lead.customer_name,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        status: "error",
        error: `HTTP ${response.status}: ${text.slice(0, 100)}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return { status: "error", error: result.error || "Unknown error" };
    }

    return {
      status: result.data?.status || "error",
      data: result.data,
    };
  } catch (error: any) {
    return { status: "error", error: error.message };
  }
}

async function updateLeadStatus(
  db: Client,
  leadId: string,
  status: string,
  data?: any,
) {
  if (status === "completed" && data) {
    // Parse birth date if needed
    let birthDate = null;
    if (data.birthDate) {
      try {
        if (data.birthDate.includes("/")) {
          const [d, m, y] = data.birthDate.split("/");
          birthDate = `${y}-${m}-${d}`;
        } else {
          birthDate = data.birthDate;
        }
      } catch {}
    }

    // Store full enriched data
    await db.query(
      `INSERT INTO c2s.enriched_leads (
        lead_id, cpf, enriched_name, birth_date, gender, mother_name,
        income, presumed_income, net_worth, occupation, education, marital_status,
        phones, emails, addresses, cpf_source, enrichment_status, enriched_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
      ON CONFLICT (lead_id) DO UPDATE SET
        cpf = EXCLUDED.cpf, enriched_name = EXCLUDED.enriched_name, birth_date = EXCLUDED.birth_date,
        gender = EXCLUDED.gender, mother_name = EXCLUDED.mother_name, income = EXCLUDED.income,
        presumed_income = EXCLUDED.presumed_income, net_worth = EXCLUDED.net_worth,
        occupation = EXCLUDED.occupation, education = EXCLUDED.education, marital_status = EXCLUDED.marital_status,
        phones = EXCLUDED.phones, emails = EXCLUDED.emails, addresses = EXCLUDED.addresses,
        cpf_source = EXCLUDED.cpf_source, enrichment_status = EXCLUDED.enrichment_status, enriched_at = NOW()`,
      [
        leadId,
        data.cpf?.slice(0, 20) || null,
        data.enrichedName?.slice(0, 255) || null,
        birthDate,
        data.gender?.slice(0, 50) || null,
        data.motherName?.slice(0, 255) || null,
        data.income || null,
        data.presumedIncome || null,
        data.netWorth || null,
        data.occupation || null,
        data.education || null,
        data.maritalStatus || null,
        JSON.stringify(data.phones || []),
        JSON.stringify(data.emails || []),
        JSON.stringify(data.addresses || []),
        data.cpfSource || null,
        status,
      ],
    );
  } else if (status === "partial" && data) {
    // Store partial data (CPF found but Work API failed)
    await db.query(
      `INSERT INTO c2s.enriched_leads (lead_id, cpf, enriched_name, cpf_source, enrichment_status, enriched_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (lead_id) DO UPDATE SET
         cpf = EXCLUDED.cpf, enriched_name = EXCLUDED.enriched_name,
         cpf_source = EXCLUDED.cpf_source, enrichment_status = EXCLUDED.enrichment_status, enriched_at = NOW()`,
      [
        leadId,
        data.cpf || null,
        data.foundName || null,
        data.cpfSource || null,
        status,
      ],
    );
  } else {
    // Just mark as processed
    await db.query(
      `INSERT INTO c2s.enriched_leads (lead_id, enrichment_status, enriched_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (lead_id) DO UPDATE SET enrichment_status = $2, enriched_at = NOW()`,
      [leadId, status],
    );
  }
}

async function main() {
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  Lead Enrichment via API (ts-c2s-api.fly.dev)");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("");
  console.log("  📋 Controls:");
  console.log("     PAUSE:  touch /tmp/enrich-pause");
  console.log("     RESUME: rm /tmp/enrich-pause");
  console.log("     STOP:   touch /tmp/enrich-stop");
  console.log("");

  // Clean up stop file if exists from previous run
  if (existsSync(STOP_FILE)) {
    unlinkSync(STOP_FILE);
  }

  // Test API connection
  console.log("🔗 Testing API connection...");
  try {
    const healthRes = await fetch(`${API_URL}/health`);
    if (!healthRes.ok)
      throw new Error(`Health check failed: ${healthRes.status}`);
    console.log("✅ API is healthy");
  } catch (error: any) {
    console.error(`❌ API connection failed: ${error.message}`);
    process.exit(1);
  }

  // Connect to database with reconnection support
  let db = new Client({ connectionString: LEADS_DB_URL });
  await db.connect();
  console.log("✅ Connected to leads-mb database");

  // Reconnection helper
  async function ensureConnection(): Promise<Client> {
    try {
      await db.query("SELECT 1");
      return db;
    } catch {
      console.log("\n🔄 Reconnecting to database...");
      try {
        await db.end();
      } catch {}
      db = new Client({ connectionString: LEADS_DB_URL });
      await db.connect();
      console.log("✅ Reconnected to database");
      return db;
    }
  }

  // Load progress
  const progress = loadProgress();
  const isResume = progress.processedCount > 0;

  if (isResume) {
    console.log(`📁 Resuming from previous session:`);
    console.log(
      `   Processed: ${progress.processedCount}, Success: ${progress.successCount}, Partial: ${progress.partialCount}, Failed: ${progress.failedCount}`,
    );
  } else {
    progress.startedAt = new Date().toISOString();
  }

  progress.status = "running";
  saveProgress(progress);

  // Get total remaining (non-duplicates + originals with waiting duplicates)
  const totalResult = await db.query(`
    SELECT COUNT(*) as count FROM (
      -- Non-duplicate leads not yet enriched
      SELECT l.id
      FROM c2s.leads l
      LEFT JOIN c2s.enriched_leads e ON l.id = e.lead_id
      LEFT JOIN c2s.lead_duplicates d ON l.id = d.lead_id
      WHERE e.lead_id IS NULL
        AND d.lead_id IS NULL
        AND l.customer_phone_normalized IS NOT NULL
        AND LENGTH(l.customer_phone_normalized) >= 10
      UNION
      -- Originals that have duplicates waiting for enrichment
      SELECT DISTINCT l.id
      FROM c2s.leads l
      JOIN c2s.lead_duplicates d ON l.id = d.duplicate_of
      LEFT JOIN c2s.enriched_leads e ON l.id = e.lead_id
      WHERE e.lead_id IS NULL
        AND l.customer_phone_normalized IS NOT NULL
        AND LENGTH(l.customer_phone_normalized) >= 10
    ) combined
  `);
  let totalRemaining = parseInt(totalResult.rows[0].count);
  console.log(`📊 Leads to process: ${totalRemaining.toLocaleString()}`);
  console.log("");

  const startTime = Date.now();
  let consecutiveErrors = 0;

  // Main loop - process one at a time
  while (true) {
    // Check for stop signal
    if (shouldStop()) {
      console.log("\n🛑 Stop signal received. Saving progress and exiting...");
      progress.status = "stopped";
      saveProgress(progress);
      break;
    }

    // Check for pause signal
    if (shouldPause()) {
      if (progress.status !== "paused") {
        console.log("\n⏸️  Paused. Remove /tmp/enrich-pause to resume...");
        progress.status = "paused";
        saveProgress(progress);
      }
      await sleep(5000);
      continue;
    }

    if (progress.status === "paused") {
      console.log("\n▶️  Resuming...");
      progress.status = "running";
      saveProgress(progress);
    }

    // Fetch next lead
    try {
      // Ensure connection is alive
      db = await ensureConnection();

      const leadResult = await db.query<Lead>(
        `
        SELECT l.id, l.customer_name, l.customer_phone_normalized, l.customer_email
        FROM (
          -- Non-duplicate leads not yet enriched
          SELECT l.id
          FROM c2s.leads l
          LEFT JOIN c2s.enriched_leads e ON l.id = e.lead_id
          LEFT JOIN c2s.lead_duplicates d ON l.id = d.lead_id
          WHERE e.lead_id IS NULL
            AND d.lead_id IS NULL
            AND l.customer_phone_normalized IS NOT NULL
            AND LENGTH(l.customer_phone_normalized) >= 10
          UNION
          -- Originals that have duplicates waiting for enrichment
          SELECT DISTINCT l.id
          FROM c2s.leads l
          JOIN c2s.lead_duplicates d ON l.id = d.duplicate_of
          LEFT JOIN c2s.enriched_leads e ON l.id = e.lead_id
          WHERE e.lead_id IS NULL
            AND l.customer_phone_normalized IS NOT NULL
            AND LENGTH(l.customer_phone_normalized) >= 10
        ) candidates
        JOIN c2s.leads l ON candidates.id = l.id
        ${progress.lastLeadId ? `WHERE l.id > '${progress.lastLeadId}'` : ""}
        ORDER BY l.id
        LIMIT 1
      `,
      );

      if (leadResult.rows.length === 0) {
        console.log("\n✅ All leads have been processed!");
        progress.status = "completed";
        saveProgress(progress);
        break;
      }

      const lead = leadResult.rows[0];
      consecutiveErrors = 0;

      // Call API to enrich
      const result = await enrichViaApi(lead);

      // Update local tracking with enriched data
      if (result.status === "completed") {
        progress.successCount++;
        await updateLeadStatus(db, lead.id, "completed", result.data);
      } else if (result.status === "partial") {
        progress.partialCount++;
        await updateLeadStatus(db, lead.id, "partial", result.data);
      } else {
        progress.failedCount++;
        await updateLeadStatus(db, lead.id, "unenriched");
      }

      progress.processedCount++;
      progress.lastLeadId = lead.id;
      totalRemaining--;

      // Save progress periodically
      if (progress.processedCount % SAVE_INTERVAL === 0) {
        saveProgress(progress);
      }

      // Display progress
      const elapsed = Date.now() - startTime;
      const rate = progress.processedCount / (elapsed / 1000 / 60); // per minute
      const eta = totalRemaining > 0 ? (totalRemaining / rate) * 60 * 1000 : 0;
      const successRate = (
        ((progress.successCount + progress.partialCount) /
          progress.processedCount) *
        100
      ).toFixed(1);

      process.stdout.write(
        `\r📊 ${progress.processedCount.toLocaleString()} | ✅ ${progress.successCount.toLocaleString()} | ⚠️ ${progress.partialCount.toLocaleString()} | ❌ ${progress.failedCount.toLocaleString()} | ${successRate}% | Rem: ${totalRemaining.toLocaleString()} | ETA: ${formatDuration(eta)}   `,
      );

      await sleep(DELAY_MS);
    } catch (error: any) {
      consecutiveErrors++;
      console.error(`\n❌ Error: ${error.message}`);

      if (consecutiveErrors >= 5) {
        console.log("\n🛑 Too many consecutive errors. Stopping...");
        progress.status = "stopped";
        saveProgress(progress);
        break;
      }

      console.log(
        `⏳ Waiting 30s before retry (attempt ${consecutiveErrors}/5)...`,
      );
      await sleep(30000);
    }
  }

  // Final summary
  const totalTime = Date.now() - startTime;
  console.log("\n");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(
    `  ${progress.status === "completed" ? "✅ ENRICHMENT COMPLETE" : "⏹️  ENRICHMENT " + progress.status.toUpperCase()}`,
  );
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(
    `  📊 Total processed: ${progress.processedCount.toLocaleString()}`,
  );
  console.log(`  ✅ Success: ${progress.successCount.toLocaleString()}`);
  console.log(`  ⚠️  Partial: ${progress.partialCount.toLocaleString()}`);
  console.log(`  ❌ Failed: ${progress.failedCount.toLocaleString()}`);
  console.log(`  ⏱️  Duration: ${formatDuration(totalTime)}`);
  console.log("");
  if (progress.status !== "completed") {
    console.log("  💡 Run again to continue from where you left off");
  }
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  await db.end();
}

main().catch(console.error);
