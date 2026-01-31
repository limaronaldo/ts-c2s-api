#!/usr/bin/env bun
/**
 * Intersect Best Leads with Meilisearch Company Data
 *
 * Finds high-income leads that are business owners by cross-referencing
 * CPFs with Meilisearch's 65M company database.
 *
 * Usage:
 *   bun run scripts/enrichment/intersect-leads-meilisearch.ts [--limit N] [--min-income N] [--dry-run]
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

// Parse arguments
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const minIncomeArg = args.find((a) => a.startsWith("--min-income="));
const dryRun = args.includes("--dry-run");

const BATCH_SIZE = parseInt(limitArg?.split("=")[1] || "100", 10);
const MIN_INCOME = parseInt(minIncomeArg?.split("=")[1] || "10000", 10);

// Meilisearch config
const MEILISEARCH_URL =
  process.env.MEILISEARCH_URL || "https://ibvi-meilisearch-v2.fly.dev";
const MEILISEARCH_KEY =
  process.env.MEILISEARCH_KEY || "+irW8+WB+vRVb2pYxvEfR0Cili9zVK/VQY5osx8ejCw=";

// Database connection
const DB_LEADS =
  process.env.DB_LEADS ||
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";

interface CompanySummary {
  totalCompanies: number;
  totalCapitalSocial: number;
  companies: Array<{
    cnpj: string;
    razaoSocial: string;
    nomeFantasia?: string;
    capitalSocial: number;
    situacao: string;
    uf?: string;
    isAdministrador: boolean;
  }>;
}

interface LeadRow {
  lead_id: string;
  cpf: string;
  enriched_name: string;
  income: number;
  num_companies: number | null;
}

async function findCompaniesByCpf(cpf: string): Promise<CompanySummary> {
  const normalizedCpf = cpf.replace(/\D/g, "");

  try {
    const response = await fetch(
      `${MEILISEARCH_URL}/indexes/companies/search`,
      {
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
      },
    );

    if (!response.ok) {
      console.error(
        `Meilisearch error for CPF ${normalizedCpf}: ${response.status}`,
      );
      return { totalCompanies: 0, totalCapitalSocial: 0, companies: [] };
    }

    const data = await response.json();
    const companies = data.hits || [];

    // Filter active companies only (situacao_cadastral = "02")
    const activeCompanies = companies.filter(
      (c: any) => c.situacao_cadastral === "02",
    );

    const totalCapitalSocial = activeCompanies.reduce(
      (sum: number, c: any) => sum + (c.capital_social || 0),
      0,
    );

    const companiesSummary = activeCompanies.map((c: any) => {
      const socio = c.socios?.find((s: any) => s.cpf === normalizedCpf);
      const isAdministrador = socio
        ? ["49", "08", "10", "16"].includes(socio.qualificacao)
        : false;

      return {
        cnpj: c.cnpj,
        razaoSocial: c.razao_social,
        nomeFantasia: c.nome_fantasia || undefined,
        capitalSocial: c.capital_social || 0,
        situacao: c.situacao_cadastral,
        uf: c.uf,
        isAdministrador,
      };
    });

    companiesSummary.sort(
      (a: any, b: any) => b.capitalSocial - a.capitalSocial,
    );

    return {
      totalCompanies: companiesSummary.length,
      totalCapitalSocial,
      companies: companiesSummary,
    };
  } catch (error) {
    console.error(`Error searching CPF ${normalizedCpf}:`, error);
    return { totalCompanies: 0, totalCapitalSocial: 0, companies: [] };
  }
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function main() {
  console.log("=".repeat(60));
  console.log("INTERSECT LEADS WITH MEILISEARCH COMPANY DATA");
  console.log("=".repeat(60));
  console.log(`Min Income: R$ ${formatCurrency(MIN_INCOME)}`);
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log(`Dry Run: ${dryRun}`);
  console.log(`Meilisearch: ${MEILISEARCH_URL}`);
  console.log("=".repeat(60));

  // Connect to leads database
  const client = postgres(DB_LEADS, { max: 1 });
  const db = drizzle(client);

  // Fetch leads needing company enrichment
  console.log("\nFetching leads needing company enrichment...");

  const leads = await db.execute<LeadRow>(sql`
    SELECT
      lead_id,
      cpf,
      enriched_name,
      income::numeric as income,
      num_companies
    FROM c2s.enriched_leads
    WHERE cpf IS NOT NULL
      AND income >= ${MIN_INCOME}
      AND (num_companies IS NULL OR num_companies = 0)
    ORDER BY income DESC
    LIMIT ${BATCH_SIZE}
  `);

  console.log(`Found ${leads.length} leads to process\n`);

  if (leads.length === 0) {
    console.log("No leads to process!");
    await client.end();
    return;
  }

  // Process stats
  let processed = 0;
  let withCompanies = 0;
  let totalCapitalFound = 0;
  const highValueLeads: Array<{
    name: string;
    income: number;
    companies: number;
    capital: number;
  }> = [];

  // Process each lead
  for (const lead of leads) {
    processed++;
    const cpf = lead.cpf;
    const name = lead.enriched_name || "Unknown";
    const income = Number(lead.income) || 0;

    process.stdout.write(
      `[${processed}/${leads.length}] ${name.substring(0, 30).padEnd(30)} (R$ ${formatCurrency(income)}) ... `,
    );

    // Search Meilisearch for companies
    const summary = await findCompaniesByCpf(cpf);

    if (summary.totalCompanies > 0) {
      withCompanies++;
      totalCapitalFound += summary.totalCapitalSocial;

      console.log(
        `✅ ${summary.totalCompanies} empresas (R$ ${formatCurrency(summary.totalCapitalSocial)})`,
      );

      // Track high-value leads
      if (summary.totalCapitalSocial >= 500000 || summary.totalCompanies >= 3) {
        highValueLeads.push({
          name,
          income,
          companies: summary.totalCompanies,
          capital: summary.totalCapitalSocial,
        });
      }

      // Update database
      if (!dryRun) {
        const companyNames = summary.companies.map((c) => c.razaoSocial);

        await db.execute(sql`
          UPDATE c2s.enriched_leads
          SET
            num_companies = ${summary.totalCompanies},
            company_names = ${JSON.stringify(companyNames)}::jsonb,
            ibvi_enriched_at = NOW()
          WHERE lead_id = ${lead.lead_id}
        `);
      }
    } else {
      console.log(`- sem empresas`);

      // Mark as checked (0 companies) so we don't re-process
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

    // Rate limiting - 50ms between requests
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Processed: ${processed}`);
  console.log(
    `With Companies: ${withCompanies} (${((withCompanies / processed) * 100).toFixed(1)}%)`,
  );
  console.log(`Total Capital Found: R$ ${formatCurrency(totalCapitalFound)}`);

  if (highValueLeads.length > 0) {
    console.log("\n🌟 HIGH-VALUE LEADS (Capital >= R$500k or 3+ companies):");
    console.log("-".repeat(60));

    highValueLeads.sort((a, b) => b.capital - a.capital);

    for (const lead of highValueLeads.slice(0, 20)) {
      console.log(
        `  ${lead.name.substring(0, 35).padEnd(35)} | ` +
          `Renda: R$ ${formatCurrency(lead.income).padStart(12)} | ` +
          `${lead.companies} emp | ` +
          `R$ ${formatCurrency(lead.capital)}`,
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
