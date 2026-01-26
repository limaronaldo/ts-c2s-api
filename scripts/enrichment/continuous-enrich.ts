/**
 * Continuous Lead Enrichment Script
 *
 * Runs continuously until all leads are enriched.
 * Supports pause/resume via control file.
 *
 * Usage:
 *   bun run scripts/continuous-enrich.ts
 *
 * Control:
 *   - To PAUSE: touch /tmp/enrich-pause
 *   - To RESUME: rm /tmp/enrich-pause
 *   - To STOP completely: touch /tmp/enrich-stop
 *
 * Progress saved every 10 leads, automatically resumes from last position.
 */

import { Client } from "pg";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";

import { CpfDiscoveryService } from "../src/services/cpf-discovery.service";
import { WorkApiService } from "../src/services/work-api.service";

const LEADS_DB_URL = "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const PROGRESS_FILE = "/tmp/continuous-enrich-progress.json";
const PAUSE_FILE = "/tmp/enrich-pause";
const STOP_FILE = "/tmp/enrich-stop";

const BATCH_SIZE = 50;
const DELAY_MS = 2500;
const PAUSE_CHECK_INTERVAL = 5000; // Check for pause every 5 seconds when paused

interface Progress {
  processedCount: number;
  successCount: number;
  failedCount: number;
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

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Continuous Lead Enrichment");
  console.log("═══════════════════════════════════════════════════════════════");
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

  // Initialize services
  const cpfDiscoveryService = new CpfDiscoveryService();
  const workApiService = new WorkApiService();

  // Connect to database
  const db = new Client({ connectionString: LEADS_DB_URL });
  await db.connect();
  console.log("✅ Connected to database");

  // Load progress
  const progress = loadProgress();
  const isResume = progress.processedCount > 0;

  if (isResume) {
    console.log(`📁 Resuming from previous session:`);
    console.log(`   Started: ${progress.startedAt}`);
    console.log(`   Processed: ${progress.processedCount}, Success: ${progress.successCount}, Failed: ${progress.failedCount}`);
  } else {
    progress.startedAt = new Date().toISOString();
  }

  progress.status = "running";
  saveProgress(progress);

  const startTime = Date.now();
  let totalRemaining = 0;
  let consecutiveErrors = 0;

  // Main loop
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
      await sleep(PAUSE_CHECK_INTERVAL);
      continue;
    }

    if (progress.status === "paused") {
      console.log("\n▶️  Resuming...");
      progress.status = "running";
      saveProgress(progress);
    }

    // Fetch next batch of leads
    try {
      const leadsResult = await db.query(
        `
        SELECT l.id, l.customer_name, l.customer_phone_normalized, l.customer_email
        FROM c2s.leads l
        LEFT JOIN c2s.enriched_leads e ON l.id = e.lead_id
        LEFT JOIN c2s.lead_duplicates d ON l.id = d.lead_id
        WHERE e.lead_id IS NULL
          AND d.lead_id IS NULL
          AND l.customer_phone_normalized IS NOT NULL
          AND LENGTH(l.customer_phone_normalized) >= 10
          ${progress.lastLeadId ? `AND l.id > '${progress.lastLeadId}'` : ""}
        ORDER BY l.id
        LIMIT ${BATCH_SIZE}
      `
      );

      const leads = leadsResult.rows;

      if (leads.length === 0) {
        console.log("\n✅ All leads have been processed!");
        progress.status = "completed";
        saveProgress(progress);
        break;
      }

      // Get total remaining for progress display (only every 500 processed)
      if (progress.processedCount % 500 === 0 || totalRemaining === 0) {
        const totalResult = await db.query(`
          SELECT COUNT(*) as count
          FROM c2s.leads l
          LEFT JOIN c2s.enriched_leads e ON l.id = e.lead_id
          LEFT JOIN c2s.lead_duplicates d ON l.id = d.lead_id
          WHERE e.lead_id IS NULL
            AND d.lead_id IS NULL
            AND l.customer_phone_normalized IS NOT NULL
            AND LENGTH(l.customer_phone_normalized) >= 10
        `);
        totalRemaining = parseInt(totalResult.rows[0].count);
      }

      consecutiveErrors = 0;

      // Process each lead
      for (const lead of leads) {
        // Check for pause/stop during batch
        if (shouldStop() || shouldPause()) break;

        const phone = lead.customer_phone_normalized;
        const name = lead.customer_name;

        try {
          // Step 1: CPF Discovery
          const cpfResult = await cpfDiscoveryService.findCpfByPhone(phone, name);

          if (!cpfResult) {
            await db.query(
              `INSERT INTO c2s.enriched_leads (lead_id, enrichment_status, enriched_at)
               VALUES ($1, 'unenriched', NOW()) ON CONFLICT DO NOTHING`,
              [lead.id]
            );
            progress.failedCount++;
          } else {
            // Step 2: Work API enrichment
            const workResult = await workApiService.fetchByCpfWithTimeout(cpfResult.cpf);

            if (!workResult.data) {
              await db.query(
                `INSERT INTO c2s.enriched_leads (lead_id, cpf, enriched_name, cpf_source, enrichment_status, enriched_at)
                 VALUES ($1, $2, $3, $4, 'partial', NOW()) ON CONFLICT DO NOTHING`,
                [lead.id, cpfResult.cpf, cpfResult.foundName, cpfResult.source]
              );
              progress.failedCount++;
            } else {
              // Store enriched data
              const person = workResult.data;

              let birthDate = null;
              if (person.dataNascimento) {
                try {
                  if (person.dataNascimento.includes("/")) {
                    const [d, m, y] = person.dataNascimento.split("/");
                    birthDate = `${y}-${m}-${d}`;
                  } else {
                    birthDate = person.dataNascimento;
                  }
                } catch {}
              }

              await db.query(
                `INSERT INTO c2s.enriched_leads (
                  lead_id, cpf, enriched_name, birth_date, gender, mother_name,
                  income, presumed_income, net_worth, occupation, education, marital_status,
                  phones, emails, addresses, cpf_source, enrichment_status, enriched_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'completed', NOW())
                ON CONFLICT DO NOTHING`,
                [
                  lead.id,
                  person.cpf?.slice(0, 20) || null,
                  person.nome?.slice(0, 255) || null,
                  birthDate,
                  person.sexo?.slice(0, 50) || null,
                  person.nomeMae?.slice(0, 255) || null,
                  person.renda || null,
                  person.rendaPresumida || null,
                  person.patrimonio || null,
                  person.profissao || null,
                  person.escolaridade || null,
                  person.estadoCivil || null,
                  JSON.stringify(person.telefones || []),
                  JSON.stringify(person.emails || []),
                  JSON.stringify(person.enderecos || []),
                  cpfResult.source,
                ]
              );
              progress.successCount++;
            }
          }
        } catch (error: any) {
          progress.failedCount++;
        }

        progress.processedCount++;
        progress.lastLeadId = lead.id;

        // Save progress every 10 leads
        if (progress.processedCount % 10 === 0) {
          saveProgress(progress);
        }

        // Display progress
        const elapsed = Date.now() - startTime;
        const rate = progress.processedCount / (elapsed / 1000 / 60); // per minute
        const eta = totalRemaining > 0 ? (totalRemaining / rate) * 60 * 1000 : 0;
        const successRate = ((progress.successCount / progress.processedCount) * 100).toFixed(1);

        process.stdout.write(
          `\r📊 ${progress.processedCount.toLocaleString()} processed | ✅ ${progress.successCount.toLocaleString()} | ❌ ${progress.failedCount.toLocaleString()} | ${successRate}% | Remaining: ${totalRemaining.toLocaleString()} | ETA: ${formatDuration(eta)}   `
        );

        await sleep(DELAY_MS);
      }

      totalRemaining -= leads.length;
    } catch (error: any) {
      consecutiveErrors++;
      console.error(`\n❌ Database error: ${error.message}`);

      if (consecutiveErrors >= 5) {
        console.log("\n🛑 Too many consecutive errors. Stopping...");
        progress.status = "stopped";
        saveProgress(progress);
        break;
      }

      // Wait and retry
      console.log(`⏳ Waiting 30s before retry (attempt ${consecutiveErrors}/5)...`);
      await sleep(30000);
    }
  }

  // Final summary
  const totalTime = Date.now() - startTime;
  console.log("\n");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  ${progress.status === "completed" ? "✅ ENRICHMENT COMPLETE" : "⏹️  ENRICHMENT " + progress.status.toUpperCase()}`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  📊 Total processed: ${progress.processedCount.toLocaleString()}`);
  console.log(`  ✅ Success: ${progress.successCount.toLocaleString()}`);
  console.log(`  ❌ Failed: ${progress.failedCount.toLocaleString()}`);
  console.log(`  ⏱️  Duration: ${formatDuration(totalTime)}`);
  console.log("");
  if (progress.status !== "completed") {
    console.log("  💡 Run again to continue from where you left off");
  }
  console.log("═══════════════════════════════════════════════════════════════");

  await db.end();
}

main().catch(console.error);
