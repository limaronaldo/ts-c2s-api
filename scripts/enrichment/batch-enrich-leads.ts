/**
 * Batch Enrich Leads from leads-mb database
 *
 * Uses the existing CPF Discovery and Work API services
 * Processes leads that don't have enrichment data yet
 *
 * Usage:
 *   bun run scripts/batch-enrich-leads.ts
 *
 * Environment:
 *   Uses .env for API keys (WORK_API, DIRETRIX_USER, DIRETRIX_PASS, DBASE_KEY)
 */

import { Client } from "pg";
import { existsSync, readFileSync, writeFileSync } from "fs";

// Bun automatically loads .env

// Import services from ts-c2s-api
import { CpfDiscoveryService } from "../src/services/cpf-discovery.service";
import {
  WorkApiService,
  type WorkApiPerson,
} from "../src/services/work-api.service";

const LEADS_DB_URL =
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const PROGRESS_FILE = "/tmp/batch-enrich-progress.json";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "100");
const DELAY_MS = parseInt(process.env.DELAY_MS || "2500"); // 2.5s between leads

interface Progress {
  processedCount: number;
  successCount: number;
  failedCount: number;
  lastLeadId: string | null;
  timestamp: string;
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
    timestamp: "",
  };
}

function saveProgress(progress: Progress) {
  progress.timestamp = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  Batch Lead Enrichment");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`  Delay between leads: ${DELAY_MS}ms`);
  console.log("");

  // Initialize services
  const cpfDiscoveryService = new CpfDiscoveryService();
  const workApiService = new WorkApiService();

  // Connect to database
  const db = new Client({ connectionString: LEADS_DB_URL });
  await db.connect();
  console.log("✅ Connected to Leads-MB database");

  // Load progress
  const progress = loadProgress();
  if (progress.processedCount > 0) {
    console.log(`📁 Resuming from previous session:`);
    console.log(
      `   Processed: ${progress.processedCount}, Success: ${progress.successCount}, Failed: ${progress.failedCount}`,
    );
  }

  // Get leads needing enrichment
  console.log("\n📋 Fetching leads to enrich...");
  const leadsResult = await db.query(`
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
  `);

  const leads = leadsResult.rows;
  console.log(`   Found ${leads.length} leads to process`);

  if (leads.length === 0) {
    console.log("\n✅ No more leads to enrich!");
    await db.end();
    return;
  }

  // Get total remaining for progress display
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
  const totalRemaining = parseInt(totalResult.rows[0].count);
  console.log(`   Total remaining: ${totalRemaining.toLocaleString()}`);

  console.log("\n🔄 Starting enrichment...\n");

  let batchSuccess = 0;
  let batchFailed = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const phone = lead.customer_phone_normalized;
    const name = lead.customer_name;

    try {
      // Step 1: CPF Discovery
      const cpfResult = await cpfDiscoveryService.findCpfByPhone(phone, name);

      if (!cpfResult) {
        // No CPF found - mark as unenriched
        await db.query(
          `
          INSERT INTO c2s.enriched_leads (lead_id, enrichment_status, enriched_at)
          VALUES ($1, 'unenriched', NOW())
          ON CONFLICT DO NOTHING
        `,
          [lead.id],
        );

        batchFailed++;
        progress.failedCount++;
        process.stdout.write(
          `\r⏳ ${i + 1}/${leads.length} | ✅ ${batchSuccess} | ❌ ${batchFailed} | Current: No CPF found`,
        );

        await sleep(DELAY_MS);
        continue;
      }

      // Step 2: Work API enrichment
      const workResult = await workApiService.fetchByCpfWithTimeout(
        cpfResult.cpf,
      );

      if (!workResult.data) {
        // CPF found but no Work API data
        await db.query(
          `
          INSERT INTO c2s.enriched_leads (lead_id, cpf, enriched_name, cpf_source, enrichment_status, enriched_at)
          VALUES ($1, $2, $3, $4, 'partial', NOW())
          ON CONFLICT DO NOTHING
        `,
          [lead.id, cpfResult.cpf, cpfResult.foundName, cpfResult.source],
        );

        batchFailed++;
        progress.failedCount++;
        process.stdout.write(
          `\r⏳ ${i + 1}/${leads.length} | ✅ ${batchSuccess} | ❌ ${batchFailed} | Current: Partial (no Work API)`,
        );

        await sleep(DELAY_MS);
        continue;
      }

      // Step 3: Store enriched data
      const person = workResult.data;

      // Parse birth date (format: DD/MM/YYYY or YYYY-MM-DD)
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
        `
        INSERT INTO c2s.enriched_leads (
          lead_id, cpf, enriched_name, birth_date, gender, mother_name,
          income, presumed_income, net_worth, occupation, education, marital_status,
          phones, emails, addresses, cpf_source, enrichment_status, enriched_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'completed', NOW())
        ON CONFLICT DO NOTHING
      `,
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
        ],
      );

      batchSuccess++;
      progress.successCount++;

      const incomeStr = person.renda
        ? `R$ ${person.renda.toLocaleString("pt-BR")}`
        : "N/A";
      process.stdout.write(
        `\r⏳ ${i + 1}/${leads.length} | ✅ ${batchSuccess} | ❌ ${batchFailed} | ${person.nome?.slice(0, 20)} | ${incomeStr}   `,
      );
    } catch (error: any) {
      batchFailed++;
      progress.failedCount++;
      process.stdout.write(
        `\r⏳ ${i + 1}/${leads.length} | ✅ ${batchSuccess} | ❌ ${batchFailed} | Error: ${error.message?.slice(0, 30)}`,
      );
    }

    progress.processedCount++;
    progress.lastLeadId = lead.id;

    // Save progress every 10 leads
    if ((i + 1) % 10 === 0) {
      saveProgress(progress);
    }

    await sleep(DELAY_MS);
  }

  // Final save
  saveProgress(progress);

  console.log("\n");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  📊 BATCH COMPLETE");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(
    `  This batch: ✅ ${batchSuccess} success, ❌ ${batchFailed} failed`,
  );
  console.log(
    `  Total: ${progress.processedCount} processed, ${progress.successCount} success, ${progress.failedCount} failed`,
  );
  console.log(`  Remaining: ${totalRemaining - leads.length} leads`);
  console.log("");
  console.log(`  💡 Run again to process next batch of ${BATCH_SIZE} leads`);
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  await db.end();
}

main().catch(console.error);
