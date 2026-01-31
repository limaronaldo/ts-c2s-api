#!/usr/bin/env bun
/**
 * Rescore Leads with Company Data
 *
 * New scoring system that properly weights:
 * - Income (0-25 points)
 * - Properties (0-25 points)
 * - Companies (0-30 points) - NEW WEIGHT
 * - Data completeness (0-20 points)
 *
 * Tiers:
 * - S (Super): Score >= 80 or exceptional criteria
 * - A: Score >= 60
 * - B: Score >= 40
 * - C: Score >= 20
 * - D: Score < 20
 *
 * Usage:
 *   bun run scripts/enrichment/rescore-leads.ts [--dry-run]
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const DB_LEADS = "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";

interface LeadRow {
  lead_id: string;
  enriched_name: string | null;
  income: number | null;
  num_companies: number | null;
  num_properties: number | null;
  estimated_patrimony: number | null;
  cpf: string | null;
  phones: any;
  emails: any;
  addresses: any;
  company_names: any;
}

interface ScoreResult {
  score: number;
  tier: string;
  breakdown: {
    income: number;
    properties: number;
    companies: number;
    completeness: number;
  };
}

function calculateScore(lead: LeadRow): ScoreResult {
  const breakdown = {
    income: 0,
    properties: 0,
    companies: 0,
    completeness: 0,
  };

  // === INCOME SCORE (0-25 points) ===
  const income = Number(lead.income) || 0;
  if (income >= 50000) breakdown.income = 25;
  else if (income >= 30000) breakdown.income = 20;
  else if (income >= 20000) breakdown.income = 15;
  else if (income >= 10000) breakdown.income = 10;
  else if (income >= 5000) breakdown.income = 5;
  else if (income > 0) breakdown.income = 2;

  // === PROPERTIES SCORE (0-25 points) ===
  const numProperties = Number(lead.num_properties) || 0;
  const patrimony = Number(lead.estimated_patrimony) || 0;

  // Points for number of properties
  if (numProperties >= 5) breakdown.properties += 10;
  else if (numProperties >= 3) breakdown.properties += 7;
  else if (numProperties >= 2) breakdown.properties += 5;
  else if (numProperties >= 1) breakdown.properties += 3;

  // Points for patrimony value
  if (patrimony >= 10000000) breakdown.properties += 15; // R$ 10M+
  else if (patrimony >= 5000000) breakdown.properties += 12; // R$ 5M+
  else if (patrimony >= 2000000) breakdown.properties += 9;  // R$ 2M+
  else if (patrimony >= 1000000) breakdown.properties += 6;  // R$ 1M+
  else if (patrimony >= 500000) breakdown.properties += 3;   // R$ 500k+

  breakdown.properties = Math.min(breakdown.properties, 25);

  // === COMPANIES SCORE (0-30 points) - ENHANCED ===
  const numCompanies = Number(lead.num_companies) || 0;
  const companyNames = lead.company_names || [];

  // Points for number of companies
  if (numCompanies >= 20) breakdown.companies = 30;
  else if (numCompanies >= 10) breakdown.companies = 25;
  else if (numCompanies >= 5) breakdown.companies = 20;
  else if (numCompanies >= 3) breakdown.companies = 15;
  else if (numCompanies >= 2) breakdown.companies = 10;
  else if (numCompanies >= 1) breakdown.companies = 5;

  // === DATA COMPLETENESS (0-20 points) ===
  let completeness = 0;
  if (lead.cpf) completeness += 5;
  if (lead.enriched_name) completeness += 3;
  if (income > 0) completeness += 3;

  // Contact info
  const phones = Array.isArray(lead.phones) ? lead.phones : [];
  const emails = Array.isArray(lead.emails) ? lead.emails : [];
  const addresses = Array.isArray(lead.addresses) ? lead.addresses : [];

  if (phones.length > 0) completeness += 3;
  if (emails.length > 0) completeness += 3;
  if (addresses.length > 0) completeness += 3;

  breakdown.completeness = Math.min(completeness, 20);

  // === TOTAL SCORE ===
  const totalScore = breakdown.income + breakdown.properties + breakdown.companies + breakdown.completeness;

  // === TIER CALCULATION ===
  let tier: string;

  // Super tier: exceptional criteria
  if (
    totalScore >= 80 ||
    numCompanies >= 20 ||
    patrimony >= 10000000 ||
    (income >= 50000 && numCompanies >= 5)
  ) {
    tier = "S";
  } else if (totalScore >= 60) {
    tier = "A";
  } else if (totalScore >= 40) {
    tier = "B";
  } else if (totalScore >= 20) {
    tier = "C";
  } else {
    tier = "D";
  }

  return {
    score: Math.min(totalScore, 100),
    tier,
    breakdown,
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log("RESCORE LEADS WITH COMPANY DATA");
  console.log("=".repeat(60));
  console.log(`Dry Run: ${dryRun}`);
  console.log("=".repeat(60));

  const client = postgres(DB_LEADS, { max: 5 });
  const db = drizzle(client);

  // Get current tier distribution
  console.log("\n📊 CURRENT TIER DISTRIBUTION:");
  const currentDist = await db.execute(sql`
    SELECT ibvi_tier, COUNT(*) as count
    FROM c2s.enriched_leads
    WHERE cpf IS NOT NULL
    GROUP BY ibvi_tier
    ORDER BY ibvi_tier
  `);
  for (const row of currentDist) {
    console.log(`  ${row.ibvi_tier || 'NULL'}: ${row.count}`);
  }

  // Fetch all leads with CPF
  console.log("\n🔄 Fetching leads...");
  const leads = await db.execute<LeadRow>(sql`
    SELECT
      lead_id,
      enriched_name,
      income::numeric as income,
      num_companies,
      num_properties,
      estimated_patrimony::numeric as estimated_patrimony,
      cpf,
      phones,
      emails,
      addresses,
      company_names
    FROM c2s.enriched_leads
    WHERE cpf IS NOT NULL
  `);

  console.log(`Found ${leads.length} leads to rescore\n`);

  // Track new distribution
  const newDist: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  const tierChanges: Record<string, number> = {};
  let processed = 0;

  // Process in batches
  const BATCH_SIZE = 500;
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);

    for (const lead of batch) {
      const result = calculateScore(lead as LeadRow);
      newDist[result.tier]++;
      processed++;

      if (!dryRun) {
        await db.execute(sql`
          UPDATE c2s.enriched_leads
          SET
            ibvi_score = ${result.score},
            ibvi_tier = ${result.tier}
          WHERE lead_id = ${lead.lead_id}
        `);
      }
    }

    // Progress
    process.stdout.write(`\r  Processed: ${processed}/${leads.length} (${((processed / leads.length) * 100).toFixed(1)}%)`);
  }

  console.log("\n");

  // Show new distribution
  console.log("📊 NEW TIER DISTRIBUTION:");
  for (const tier of ["S", "A", "B", "C", "D"]) {
    const current = currentDist.find((r: any) => r.ibvi_tier === tier);
    const currentCount = Number(current?.count || 0);
    const newCount = newDist[tier];
    const diff = newCount - currentCount;
    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
    console.log(`  ${tier}: ${newCount.toLocaleString().padStart(6)} (${diffStr})`);
  }

  // Show some examples of high-scoring leads
  if (!dryRun) {
    console.log("\n🌟 TOP 20 RESCORED LEADS:");
    const topLeads = await db.execute(sql`
      SELECT
        enriched_name,
        income::numeric as income,
        num_companies,
        num_properties,
        estimated_patrimony::numeric as estimated_patrimony,
        ibvi_score,
        ibvi_tier
      FROM c2s.enriched_leads
      WHERE cpf IS NOT NULL
      ORDER BY ibvi_score DESC
      LIMIT 20
    `);

    console.log("-".repeat(100));
    for (const lead of topLeads) {
      const name = (lead.enriched_name || "Unknown").substring(0, 30).padEnd(30);
      const income = Number(lead.income) || 0;
      const companies = lead.num_companies || 0;
      const properties = lead.num_properties || 0;
      const patrimony = Number(lead.estimated_patrimony) || 0;
      const score = Number(lead.ibvi_score) || 0;
      const tier = lead.ibvi_tier || "?";

      console.log(
        `  ${name} | ` +
        `Score: ${score.toFixed(1).padStart(5)} | ` +
        `Tier: ${tier} | ` +
        `Income: R$ ${income.toLocaleString("pt-BR", { minimumFractionDigits: 0 }).padStart(10)} | ` +
        `${companies.toString().padStart(4)} emp | ` +
        `${properties.toString().padStart(2)} props | ` +
        `R$ ${(patrimony / 1000000).toFixed(1)}M`
      );
    }
  }

  if (dryRun) {
    console.log("\n⚠️  DRY RUN - No changes were made to the database");
  }

  await client.end();
  console.log("\n✅ Done!");
}

main().catch(console.error);
