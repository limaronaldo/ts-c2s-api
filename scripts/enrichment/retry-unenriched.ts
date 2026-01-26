/**
 * Retry Unenriched Leads via batch/enrich-direct
 *
 * Uses the batch endpoint which goes directly to Work API.
 *
 * Usage:
 *   bun run scripts/enrichment/retry-unenriched.ts
 *
 * Control:
 *   - To STOP: touch /tmp/retry-unenriched-stop
 */

import pg from "pg";
import { existsSync, readFileSync, writeFileSync } from "fs";

const API_URL = "https://ts-c2s-api.fly.dev/batch/enrich-direct";
const LEADS_DB_URL =
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const PROGRESS_FILE = "/tmp/retry-unenriched-progress.json";
const STOP_FILE = "/tmp/retry-unenriched-stop";

const DELAY_MS = 2500;
const SAVE_INTERVAL = 20;

interface Progress {
  processedCount: number;
  successCount: number;
  partialCount: number;
  failedCount: number;
  errorCount: number;
  lastLeadId: string | null;
  startedAt: string;
  lastUpdated: string;
}

interface Lead {
  lead_id: string;
  customer_name: string;
  customer_phone_normalized: string;
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
    partialCount: 0,
    failedCount: 0,
    errorCount: 0,
    lastLeadId: null,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
}

function saveProgress(progress: Progress) {
  progress.lastUpdated = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function shouldStop(): boolean {
  return existsSync(STOP_FILE);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichLead(
  lead: Lead,
): Promise<{ status: string; cpf?: string }> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: lead.customer_name,
      phone: lead.customer_phone_normalized,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const json = await response.json();
  return {
    status: json.data?.status || "error",
    cpf: json.data?.cpf,
  };
}

async function updateLeadStatus(
  db: pg.Pool,
  leadId: string,
  status: string,
  cpf?: string,
) {
  if (status === "completed" || status === "partial") {
    // The API already updated enriched_leads, but let's make sure
    await db.query(
      `
      UPDATE c2s.enriched_leads
      SET enrichment_status = $2, cpf = COALESCE(cpf, $3)
      WHERE lead_id = $1
    `,
      [leadId, status, cpf],
    );
  }
}

async function main() {
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  🔄 RETRY ALL UNENRICHED LEADS");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("");

  const db = new pg.Pool({ connectionString: LEADS_DB_URL });
  console.log("✅ Connected to database");

  let progress = loadProgress();
  if (progress.processedCount > 0) {
    console.log(
      `📁 Resuming: ${progress.processedCount} done, ${progress.successCount} success, ${progress.partialCount} partial`,
    );
  }

  // Get count
  const countResult = await db.query(`
    SELECT COUNT(*) as count
    FROM c2s.enriched_leads e
    JOIN c2s.leads l ON e.lead_id = l.id
    WHERE e.enrichment_status = 'unenriched'
      AND l.customer_phone_normalized IS NOT NULL
      AND LENGTH(l.customer_phone_normalized) >= 10
      ${progress.lastLeadId ? `AND e.lead_id > '${progress.lastLeadId}'` : ""}
  `);
  const totalRemaining = parseInt(countResult.rows[0].count);
  console.log(`📊 Leads to retry: ${totalRemaining}`);

  const etaMinutes = ((totalRemaining * DELAY_MS) / 1000 / 60).toFixed(0);
  console.log(`⏱️  Estimated time: ${etaMinutes} minutes`);
  console.log("");

  const startTime = Date.now();

  while (true) {
    if (shouldStop()) {
      console.log("\n🛑 Stop signal received.");
      saveProgress(progress);
      break;
    }

    // Get next unenriched lead
    const leadResult = await db.query<Lead>(`
      SELECT e.lead_id, l.customer_name, l.customer_phone_normalized
      FROM c2s.enriched_leads e
      JOIN c2s.leads l ON e.lead_id = l.id
      WHERE e.enrichment_status = 'unenriched'
        AND l.customer_phone_normalized IS NOT NULL
        AND LENGTH(l.customer_phone_normalized) >= 10
        ${progress.lastLeadId ? `AND e.lead_id > '${progress.lastLeadId}'` : ""}
      ORDER BY e.lead_id
      LIMIT 1
    `);

    if (leadResult.rows.length === 0) {
      console.log("\n✅ All unenriched leads processed!");
      break;
    }

    const lead = leadResult.rows[0];
    progress.lastLeadId = lead.lead_id;

    try {
      const result = await enrichLead(lead);

      if (result.status === "completed") {
        progress.successCount++;
        await updateLeadStatus(db, lead.lead_id, "completed", result.cpf);
        console.log(
          `✅ ${lead.customer_name?.slice(0, 25).padEnd(25)} | ${lead.customer_phone_normalized} | CPF: ***${result.cpf?.slice(-4)}`,
        );
      } else if (result.status === "partial") {
        progress.partialCount++;
        await updateLeadStatus(db, lead.lead_id, "partial", result.cpf);
        console.log(
          `⚠️  ${lead.customer_name?.slice(0, 25).padEnd(25)} | ${lead.customer_phone_normalized} | partial`,
        );
      } else {
        progress.failedCount++;
        // Keep as unenriched - no update needed
      }
    } catch (err: any) {
      progress.errorCount++;
      if (progress.errorCount % 10 === 0) {
        console.log(`🔴 API errors: ${progress.errorCount}`);
      }
    }

    progress.processedCount++;

    if (progress.processedCount % SAVE_INTERVAL === 0) {
      saveProgress(progress);
      const elapsed = (Date.now() - startTime) / 1000 / 60;
      const rate = progress.processedCount / elapsed;
      const remaining = totalRemaining - progress.processedCount;
      const eta = remaining / rate;
      const successRate = (
        ((progress.successCount + progress.partialCount) /
          progress.processedCount) *
        100
      ).toFixed(1);
      console.log(
        `\n📊 ${progress.processedCount}/${totalRemaining} | ✅ ${progress.successCount} | ⚠️ ${progress.partialCount} | Rate: ${successRate}% | ETA: ${eta.toFixed(0)}m\n`,
      );
    }

    await sleep(DELAY_MS);
  }

  saveProgress(progress);

  const duration = (Date.now() - startTime) / 1000 / 60;
  const successRate = (
    ((progress.successCount + progress.partialCount) /
      progress.processedCount) *
    100
  ).toFixed(1);

  console.log(
    "\n═══════════════════════════════════════════════════════════════",
  );
  console.log("  📊 FINAL RESULTS");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(`  Processed: ${progress.processedCount}`);
  console.log(`  ✅ Completed: ${progress.successCount}`);
  console.log(`  ⚠️  Partial: ${progress.partialCount}`);
  console.log(`  ❌ Still unenriched: ${progress.failedCount}`);
  console.log(`  🔴 API errors: ${progress.errorCount}`);
  console.log(`  Success rate: ${successRate}%`);
  console.log(`  Duration: ${duration.toFixed(1)} minutes`);
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  await db.end();
}

main().catch(console.error);
