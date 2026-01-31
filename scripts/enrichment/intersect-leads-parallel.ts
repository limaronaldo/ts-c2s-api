#!/usr/bin/env bun
/**
 * Parallel Intersection of Leads with Meilisearch Company Data
 *
 * Processes leads in parallel batches for faster throughput.
 *
 * Usage:
 *   bun run scripts/enrichment/intersect-leads-parallel.ts [--concurrency N] [--batch N] [--dry-run]
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

// Parse arguments
const args = process.argv.slice(2);
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
const batchArg = args.find((a) => a.startsWith("--batch="));
const limitArg = args.find((a) => a.startsWith("--limit="));
const dryRun = args.includes("--dry-run");

const CONCURRENCY = parseInt(concurrencyArg?.split("=")[1] || "20", 10);
const BATCH_SIZE = parseInt(batchArg?.split("=")[1] || "500", 10);
const LIMIT = parseInt(limitArg?.split("=")[1] || "50000", 10);

// Meilisearch config
const MEILISEARCH_URL = process.env.MEILISEARCH_URL || "https://ibvi-meilisearch-v2.fly.dev";
const MEILISEARCH_KEY = process.env.MEILISEARCH_KEY || "+irW8+WB+vRVb2pYxvEfR0Cili9zVK/VQY5osx8ejCw=";

// Database connection
const DB_LEADS = process.env.DB_LEADS || "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";

interface CompanySummary {
  totalCompanies: number;
  totalCapitalSocial: number;
  companyNames: string[];
}

interface LeadRow {
  lead_id: string;
  cpf: string;
  enriched_name: string;
  income: number;
}

// Stats tracking
const stats = {
  processed: 0,
  withCompanies: 0,
  totalCapital: 0,
  errors: 0,
  startTime: Date.now(),
  highValueLeads: [] as Array<{ name: string; income: number; companies: number; capital: number }>,
};

async function findCompaniesByCpf(cpf: string): Promise<CompanySummary> {
  const normalizedCpf = cpf.replace(/\D/g, "");

  try {
    const response = await fetch(`${MEILISEARCH_URL}/indexes/companies/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MEILISEARCH_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: "",
        filter: `socios_cpfs = "${normalizedCpf}"`,
        limit: 50,
      }),
    });

    if (!response.ok) {
      return { totalCompanies: 0, totalCapitalSocial: 0, companyNames: [] };
    }

    const data = await response.json();
    const companies = data.hits || [];

    // Filter active companies only (situacao_cadastral = "02")
    const activeCompanies = companies.filter(
      (c: any) => c.situacao_cadastral === "02"
    );

    const totalCapitalSocial = activeCompanies.reduce(
      (sum: number, c: any) => sum + (c.capital_social || 0),
      0
    );

    const companyNames = activeCompanies.map((c: any) => c.razao_social);

    return {
      totalCompanies: activeCompanies.length,
      totalCapitalSocial,
      companyNames,
    };
  } catch (error) {
    stats.errors++;
    return { totalCompanies: 0, totalCapitalSocial: 0, companyNames: [] };
  }
}

async function processLead(
  lead: LeadRow,
  db: ReturnType<typeof drizzle>
): Promise<void> {
  const summary = await findCompaniesByCpf(lead.cpf);

  stats.processed++;

  if (summary.totalCompanies > 0) {
    stats.withCompanies++;
    stats.totalCapital += summary.totalCapitalSocial;

    // Track high-value leads
    if (summary.totalCapitalSocial >= 500000 || summary.totalCompanies >= 3) {
      stats.highValueLeads.push({
        name: lead.enriched_name || "Unknown",
        income: Number(lead.income) || 0,
        companies: summary.totalCompanies,
        capital: summary.totalCapitalSocial,
      });
    }

    if (!dryRun) {
      await db.execute(sql`
        UPDATE c2s.enriched_leads
        SET
          num_companies = ${summary.totalCompanies},
          company_names = ${JSON.stringify(summary.companyNames)}::jsonb,
          ibvi_enriched_at = NOW()
        WHERE lead_id = ${lead.lead_id}
      `);
    }
  } else {
    if (!dryRun) {
      await db.execute(sql`
        UPDATE c2s.enriched_leads
        SET
          num_companies = 0,
          ibvi_enriched_at = NOW()
        WHERE lead_id = ${lead.lead_id}
      `);
    }
  }
}

async function processBatch(
  leads: LeadRow[],
  db: ReturnType<typeof drizzle>
): Promise<void> {
  // Process in chunks of CONCURRENCY
  for (let i = 0; i < leads.length; i += CONCURRENCY) {
    const chunk = leads.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((lead) => processLead(lead, db)));
  }
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `R$ ${(value / 1_000_000_000_000).toFixed(2)}T`;
  } else if (value >= 1_000_000_000) {
    return `R$ ${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (value >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(2)}M`;
  }
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function printProgress(total: number): void {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = stats.processed / elapsed;
  const remaining = total - stats.processed;
  const eta = remaining / rate;

  process.stdout.write(
    `\r[${stats.processed.toLocaleString()}/${total.toLocaleString()}] ` +
    `${((stats.processed / total) * 100).toFixed(1)}% | ` +
    `${rate.toFixed(0)}/s | ` +
    `Companies: ${stats.withCompanies.toLocaleString()} (${((stats.withCompanies / stats.processed) * 100).toFixed(1)}%) | ` +
    `Capital: ${formatCurrency(stats.totalCapital)} | ` +
    `ETA: ${Math.floor(eta / 60)}m${Math.floor(eta % 60)}s   `
  );
}

async function main() {
  console.log("=".repeat(70));
  console.log("PARALLEL INTERSECTION - LEADS × MEILISEARCH COMPANIES");
  console.log("=".repeat(70));
  console.log(`Concurrency: ${CONCURRENCY} parallel requests`);
  console.log(`Batch Size: ${BATCH_SIZE} leads per batch`);
  console.log(`Limit: ${LIMIT} leads`);
  console.log(`Dry Run: ${dryRun}`);
  console.log(`Meilisearch: ${MEILISEARCH_URL}`);
  console.log("=".repeat(70));

  // Connect to database
  const client = postgres(DB_LEADS, { max: 10 });
  const db = drizzle(client);

  // Count total leads to process
  const countResult = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) as count
    FROM c2s.enriched_leads
    WHERE cpf IS NOT NULL
      AND (num_companies IS NULL)
    LIMIT ${LIMIT}
  `);
  const totalToProcess = Math.min(parseInt(countResult[0]?.count || "0", 10), LIMIT);

  console.log(`\nTotal leads to process: ${totalToProcess.toLocaleString()}\n`);

  if (totalToProcess === 0) {
    console.log("No leads to process!");
    await client.end();
    return;
  }

  // Process in batches
  let offset = 0;
  while (offset < totalToProcess) {
    const leads = await db.execute<LeadRow>(sql`
      SELECT
        lead_id,
        cpf,
        enriched_name,
        income::numeric as income
      FROM c2s.enriched_leads
      WHERE cpf IS NOT NULL
        AND (num_companies IS NULL)
      ORDER BY income DESC NULLS LAST
      LIMIT ${BATCH_SIZE}
      OFFSET ${offset}
    `);

    if (leads.length === 0) break;

    await processBatch(leads as LeadRow[], db);
    printProgress(totalToProcess);

    offset += BATCH_SIZE;
  }

  // Final summary
  const elapsed = (Date.now() - stats.startTime) / 1000;

  console.log("\n\n" + "=".repeat(70));
  console.log("FINAL SUMMARY");
  console.log("=".repeat(70));
  console.log(`Processed: ${stats.processed.toLocaleString()}`);
  console.log(`With Companies: ${stats.withCompanies.toLocaleString()} (${((stats.withCompanies / stats.processed) * 100).toFixed(1)}%)`);
  console.log(`Total Capital Found: ${formatCurrency(stats.totalCapital)}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Time: ${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s`);
  console.log(`Rate: ${(stats.processed / elapsed).toFixed(1)} leads/second`);

  if (stats.highValueLeads.length > 0) {
    console.log(`\n🌟 TOP 20 HIGH-VALUE LEADS (Capital >= R$500k or 3+ companies):`);
    console.log("-".repeat(70));

    stats.highValueLeads.sort((a, b) => b.capital - a.capital);

    for (const lead of stats.highValueLeads.slice(0, 20)) {
      console.log(
        `  ${lead.name.substring(0, 35).padEnd(35)} | ` +
        `${lead.companies.toString().padStart(3)} emp | ` +
        `${formatCurrency(lead.capital)}`
      );
    }
  }

  if (dryRun) {
    console.log("\n⚠️  DRY RUN - No changes were made to the database");
  }

  await client.end();
  console.log("\nDone!");
}

main().catch(console.error);
