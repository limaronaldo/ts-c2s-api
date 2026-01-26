/**
 * Google Search Enrichment for Partial Leads
 *
 * Uses ChromeDriver to search Google for customer info and extract:
 * - Profession/occupation
 * - Company
 * - Location hints
 *
 * Usage:
 *   bun run scripts/enrichment/google-enrich.ts
 *
 * Control:
 *   - To PAUSE: touch /tmp/google-enrich-pause
 *   - To STOP: touch /tmp/google-enrich-stop
 */

import puppeteer from "puppeteer-core";
import pg from "pg";
import { existsSync, readFileSync, writeFileSync } from "fs";

const LEADS_DB_URL =
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const PROGRESS_FILE = "/tmp/google-enrich-progress.json";
const PAUSE_FILE = "/tmp/google-enrich-pause";
const STOP_FILE = "/tmp/google-enrich-stop";
const CHROMEDRIVER_PATH = "/opt/homebrew/bin/chromedriver";

// Delay between searches to avoid detection
const DELAY_MIN_MS = 5000;
const DELAY_MAX_MS = 10000;
const SAVE_INTERVAL = 5;

interface Progress {
  processedCount: number;
  enrichedCount: number;
  skippedCount: number;
  lastLeadId: string | null;
  startedAt: string;
  lastUpdated: string;
  status: "running" | "paused" | "stopped" | "completed";
}

interface PartialLead {
  lead_id: string;
  cpf: string;
  enriched_name: string;
}

interface GoogleResult {
  profession?: string;
  company?: string;
  location?: string;
  linkedin?: string;
  snippets: string[];
}

function loadProgress(): Progress {
  try {
    if (existsSync(PROGRESS_FILE)) {
      return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
    }
  } catch {}
  return {
    processedCount: 0,
    enrichedCount: 0,
    skippedCount: 0,
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

function shouldPause(): boolean {
  return existsSync(PAUSE_FILE);
}

function shouldStop(): boolean {
  return existsSync(STOP_FILE);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): number {
  return (
    Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS)) + DELAY_MIN_MS
  );
}

// Extract profession keywords from search results
const PROFESSION_KEYWORDS = [
  "advogado",
  "advogada",
  "médico",
  "médica",
  "engenheiro",
  "engenheira",
  "arquiteto",
  "arquiteta",
  "empresário",
  "empresária",
  "diretor",
  "diretora",
  "gerente",
  "consultor",
  "consultora",
  "professor",
  "professora",
  "contador",
  "contadora",
  "dentista",
  "psicólogo",
  "psicóloga",
  "analista",
  "desenvolvedor",
  "programador",
  "designer",
  "CEO",
  "CFO",
  "CTO",
  "sócio",
  "sócia",
  "fundador",
  "fundadora",
  "presidente",
  "investidor",
  "investidora",
  "corretor",
  "corretora",
  "administrador",
  "administradora",
  "economista",
  "jornalista",
  "publicitário",
  "publicitária",
  "veterinário",
  "veterinária",
  "farmacêutico",
  "farmacêutica",
  "nutricionista",
  "fisioterapeuta",
  "enfermeiro",
  "enfermeira",
  "piloto",
  "juiz",
  "juíza",
  "promotor",
  "promotora",
  "procurador",
  "procuradora",
  "delegado",
  "delegada",
  "auditor",
  "auditora",
  "trader",
  "banker",
];

function extractProfession(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  for (const keyword of PROFESSION_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return keyword.charAt(0).toUpperCase() + keyword.slice(1);
    }
  }
  return undefined;
}

function extractLinkedIn(text: string): string | undefined {
  const match = text.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/);
  return match ? `https://linkedin.com/in/${match[1]}` : undefined;
}

async function searchGoogle(
  page: puppeteer.Page,
  query: string,
): Promise<GoogleResult> {
  const result: GoogleResult = { snippets: [] };

  try {
    // Navigate to Google
    await page.goto(
      `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      {
        waitUntil: "networkidle2",
        timeout: 30000,
      },
    );

    // Wait for results
    await sleep(2000);

    // Check for CAPTCHA
    const pageContent = await page.content();
    if (
      pageContent.includes("unusual traffic") ||
      pageContent.includes("captcha")
    ) {
      console.log("⚠️  CAPTCHA detected! Please solve it manually...");
      await sleep(30000); // Wait for manual solving
    }

    // Extract search result snippets
    const snippets = await page.evaluate(() => {
      const results: string[] = [];

      // Get all search result snippets
      document.querySelectorAll(".VwiC3b, .IsZvec, .s3v9rd").forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 20) {
          results.push(text);
        }
      });

      // Get titles too
      document.querySelectorAll("h3").forEach((el) => {
        const text = el.textContent?.trim();
        if (text) {
          results.push(text);
        }
      });

      return results.slice(0, 10);
    });

    result.snippets = snippets;

    // Extract structured data
    const allText = snippets.join(" ");
    result.profession = extractProfession(allText);
    result.linkedin = extractLinkedIn(allText);

    // Look for company mentions
    const companyMatch = allText.match(
      /(?:na|at|@)\s+([A-Z][A-Za-z\s&]+(?:S\.?A\.?|Ltda|Inc|Corp)?)/,
    );
    if (companyMatch) {
      result.company = companyMatch[1].trim();
    }
  } catch (error) {
    console.error("Search error:", error);
  }

  return result;
}

async function main() {
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  🔍 GOOGLE SEARCH ENRICHMENT");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("");

  // Connect to database
  const db = new pg.Pool({ connectionString: LEADS_DB_URL });
  console.log("✅ Connected to database");

  // Connect to existing Chrome with remote debugging on port 9222
  // Start Chrome first with: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile
  console.log("🌐 Connecting to Chrome on port 9222...");
  const browser = await puppeteer.connect({
    browserURL: "http://localhost:9222",
  });

  let page = await browser.newPage();

  // Load progress
  let progress = loadProgress();
  if (progress.processedCount > 0) {
    console.log(`📁 Resuming from previous session:`);
    console.log(
      `   Processed: ${progress.processedCount}, Enriched: ${progress.enrichedCount}`,
    );
  }

  // Get count of partial leads
  const countResult = await db.query(`
    SELECT COUNT(*) as count
    FROM c2s.enriched_leads
    WHERE enrichment_status = 'partial'
      AND income IS NULL
      AND enriched_name IS NOT NULL
      AND enriched_name NOT LIKE '%S.A.%'
      AND enriched_name NOT LIKE '%LTDA%'
      AND enriched_name NOT LIKE '%S/A%'
      ${progress.lastLeadId ? `AND lead_id > '${progress.lastLeadId}'` : ""}
  `);
  const totalRemaining = parseInt(countResult.rows[0].count);
  console.log(`📊 Partial leads to search: ${totalRemaining}`);
  console.log("");

  progress.status = "running";
  saveProgress(progress);

  const startTime = Date.now();

  while (true) {
    // Check for stop signal
    if (shouldStop()) {
      console.log("\n🛑 Stop signal received. Saving progress...");
      progress.status = "stopped";
      saveProgress(progress);
      break;
    }

    // Check for pause
    if (shouldPause()) {
      if (progress.status !== "paused") {
        console.log(
          "\n⏸️  Paused. Remove /tmp/google-enrich-pause to resume...",
        );
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

    // Fetch next partial lead (skip companies - only people names)
    const leadResult = await db.query<PartialLead>(`
      SELECT lead_id, cpf, enriched_name
      FROM c2s.enriched_leads
      WHERE enrichment_status = 'partial'
        AND income IS NULL
        AND enriched_name IS NOT NULL
        AND enriched_name !~ '(S\\.?A\\.?|LTDA|EIRELI|S/A|S S$|BANCO|UNIBANCO|AUDITORES|INCORPORADORA|CONSTRUTORA|IMOBILIARIA|HOLDING|INVESTIMENTOS|PARTICIPACOES|EMPREENDIMENTOS|COOPERATIVA|SOCIEDADE|ASSOCIACAO|CONSULTORIA|ADMINISTRADORA|SERVICOS|COMERCIO|INDUSTRIA| ME$| EPP$)'
        AND enriched_name ~ '^[A-Z][A-Z]+ [A-Z]'
        AND LENGTH(enriched_name) > 8
        AND LENGTH(enriched_name) < 50
        AND array_length(string_to_array(enriched_name, ' '), 1) BETWEEN 2 AND 5
        ${progress.lastLeadId ? `AND lead_id > '${progress.lastLeadId}'` : ""}
      ORDER BY lead_id
      LIMIT 1
    `);

    if (leadResult.rows.length === 0) {
      console.log("\n✅ All partial leads processed!");
      progress.status = "completed";
      saveProgress(progress);
      break;
    }

    const lead = leadResult.rows[0];
    progress.lastLeadId = lead.lead_id;

    // Build search query
    const searchQuery = `"${lead.enriched_name}" profissão OR empresa OR linkedin`;

    console.log(`\n🔍 [${progress.processedCount + 1}] ${lead.enriched_name}`);
    console.log(`   Query: ${searchQuery}`);

    // Search Google with error recovery
    let searchResult: GoogleResult = { snippets: [] };
    try {
      searchResult = await searchGoogle(page, searchQuery);
    } catch (err: any) {
      // If page detached, create new page
      if (
        err.message?.includes("detached") ||
        err.message?.includes("disposed")
      ) {
        console.log("   🔄 Reconnecting page...");
        try {
          page = await browser.newPage();
          searchResult = await searchGoogle(page, searchQuery);
        } catch {
          console.log("   ❌ Page error, skipping...");
          progress.skippedCount++;
          progress.processedCount++;
          continue;
        }
      } else {
        console.log(`   ❌ Search error: ${err.message}`);
        progress.skippedCount++;
        progress.processedCount++;
        continue;
      }
    }

    if (
      searchResult.profession ||
      searchResult.company ||
      searchResult.linkedin
    ) {
      console.log(`   ✅ Found:`);
      if (searchResult.profession)
        console.log(`      Profession: ${searchResult.profession}`);
      if (searchResult.company)
        console.log(`      Company: ${searchResult.company}`);
      if (searchResult.linkedin)
        console.log(`      LinkedIn: ${searchResult.linkedin}`);

      // Update database with retry
      try {
        await db.query(
          `
          UPDATE c2s.enriched_leads
          SET
            occupation = COALESCE(occupation, $2),
            enrichment_status = CASE
              WHEN $2 IS NOT NULL THEN 'completed'
              ELSE enrichment_status
            END
          WHERE lead_id = $1
        `,
          [lead.lead_id, searchResult.profession],
        );
        progress.enrichedCount++;
      } catch (dbErr: any) {
        console.log(`   ⚠️  DB error: ${dbErr.message}`);
        // Continue anyway, we can retry later
      }
    } else {
      console.log(`   ⚠️  No useful data found`);
      progress.skippedCount++;
    }

    progress.processedCount++;

    // Save progress periodically
    if (progress.processedCount % SAVE_INTERVAL === 0) {
      saveProgress(progress);
    }

    // Show stats
    const elapsed = (Date.now() - startTime) / 1000 / 60;
    const rate = progress.processedCount / elapsed;
    console.log(
      `   📊 ${progress.processedCount} processed | ${progress.enrichedCount} enriched | ${rate.toFixed(1)}/min`,
    );

    // Random delay to avoid detection
    const delay = randomDelay();
    console.log(`   ⏳ Waiting ${(delay / 1000).toFixed(1)}s...`);
    await sleep(delay);
  }

  // Final stats
  const duration = (Date.now() - startTime) / 1000 / 60;
  console.log(
    "\n═══════════════════════════════════════════════════════════════",
  );
  console.log("  📊 FINAL RESULTS");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(`  Processed: ${progress.processedCount}`);
  console.log(`  Enriched: ${progress.enrichedCount}`);
  console.log(`  Skipped: ${progress.skippedCount}`);
  console.log(`  Duration: ${duration.toFixed(1)} minutes`);
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  await browser.close();
  await db.end();
}

main().catch(console.error);
