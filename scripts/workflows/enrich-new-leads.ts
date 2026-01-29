/**
 * Workflow: Fetch new leads → Enrich → Store → Report
 *
 * Steps:
 * 1. Fetch last 200 leads from C2S
 * 2. Find which are not in database
 * 3. Enrich new leads via EnrichmentService
 * 4. Store in c2s.leads table
 * 5. Generate detailed report
 */

import { C2SService, type C2SLead } from "../../src/services/c2s.service";
import { container } from "../../src/container";
import { neon } from "@neondatabase/serverless";
import { writeFileSync } from "fs";

const LEADS_DB_URL =
  process.env.LEADS_DB_URL ||
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb";

interface EnrichmentResult {
  leadId: string;
  customer: string;
  phone: string;
  email?: string;
  success: boolean;
  cpf?: string;
  income?: number;
  error?: string;
  enrichmentData?: any;
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");

  if (digits.length >= 12 && digits.startsWith("55")) {
    return digits.slice(2);
  }

  return digits || null;
}

async function main() {
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  Enrich New Leads Workflow");
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  const c2sService = new C2SService();
  const enrichmentService = container.enrichment;
  const sql = neon(LEADS_DB_URL);

  // Step 1: Fetch last 200 leads from C2S
  console.log("📥 Step 1/5: Fetching last 200 leads from C2S...\n");

  const allLeads: C2SLead[] = [];
  for (let page = 1; page <= 4; page++) {
    const response = await c2sService.getLeads({
      page,
      perpage: 50,
      sort: "-created_at",
    });

    allLeads.push(...(response.data || []));
    console.log(`   Page ${page}: ${response.data?.length || 0} leads`);

    if (page < 4) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\n✅ Fetched ${allLeads.length} leads\n`);

  // Step 2: Find new leads
  console.log("🔍 Step 2/5: Checking which leads are new...\n");

  const leadIds = allLeads.map((l) => l.id);
  const existingLeads = await sql`
    SELECT id FROM c2s.leads WHERE id = ANY(${leadIds})
  `;

  const existingIds = new Set(existingLeads.map((r: any) => r.id));
  const newLeads = allLeads.filter((l) => !existingIds.has(l.id));

  console.log(`   Already in database: ${existingIds.size}`);
  console.log(`   🆕 New leads to enrich: ${newLeads.length}\n`);

  if (newLeads.length === 0) {
    console.log("✅ No new leads to process!\n");
    return;
  }

  // Step 3: Enrich new leads
  console.log("⚡ Step 3/5: Enriching new leads...\n");

  const enrichmentResults: EnrichmentResult[] = [];
  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < newLeads.length; i++) {
    const lead = newLeads[i];
    const customer = C2SService.extractCustomerName(lead);
    const phone = C2SService.extractPhone(lead);
    const email = C2SService.extractEmail(lead);

    if (!phone) {
      enrichmentResults.push({
        leadId: lead.id,
        customer,
        phone: "N/A",
        email,
        success: false,
        error: "No phone number",
      });
      failed++;
      continue;
    }

    try {
      process.stdout.write(
        `\r   Enriching ${i + 1}/${newLeads.length}: ${customer.slice(0, 30)}...`,
      );

      const result = await enrichmentService.enrichLead({
        phone,
        name: customer,
        email,
        leadId: lead.id,
      });

      enrichmentResults.push({
        leadId: lead.id,
        customer,
        phone,
        email,
        success: result.enriched,
        cpf: result.data?.cpf,
        income: result.data?.income,
        enrichmentData: result.data,
      });

      if (result.enriched) {
        enriched++;
      } else {
        failed++;
      }

      // Rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    } catch (error: any) {
      enrichmentResults.push({
        leadId: lead.id,
        customer,
        phone,
        email,
        success: false,
        error: error.message,
      });
      failed++;
    }
  }

  console.log(
    `\n\n✅ Enrichment complete: ${enriched} enriched, ${failed} failed\n`,
  );

  // Step 4: Store in database
  console.log("💾 Step 4/5: Storing leads in database...\n");

  // Ensure table exists
  await sql`CREATE SCHEMA IF NOT EXISTS c2s`;
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
    )
  `;

  let stored = 0;
  for (const lead of newLeads) {
    const attr = lead.attributes || {};
    const customer = attr.customer || {};
    const seller = attr.seller;
    const product = attr.product;
    const leadSource = attr.lead_source;
    const channel = attr.channel;
    const leadStatus = attr.lead_status;

    await sql`
      INSERT INTO c2s.leads (
        id, internal_id, customer_name, customer_email,
        customer_phone, customer_phone_normalized,
        seller_name, seller_email, seller_id,
        product_description, lead_source, channel, lead_status,
        created_at, updated_at, synced_at
      ) VALUES (
        ${lead.id},
        ${lead.internal_id},
        ${customer.name || lead.customer},
        ${customer.email || lead.email},
        ${customer.phone || lead.phone},
        ${normalizePhone(customer.phone || lead.phone)},
        ${seller?.name},
        ${seller?.email},
        ${seller?.id || lead.seller_id},
        ${product?.description || lead.product},
        ${leadSource?.name || lead.source},
        ${channel?.name},
        ${leadStatus?.alias || lead.status},
        ${attr.created_at || lead.created_at},
        ${attr.updated_at || lead.updated_at},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO NOTHING
    `;
    stored++;
  }

  console.log(`✅ Stored ${stored} leads in database\n`);

  // Step 5: Generate report
  console.log("📊 Step 5/5: Generating report...\n");

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFetched: allLeads.length,
      alreadyInDB: existingIds.size,
      newLeads: newLeads.length,
      enriched,
      failed,
      stored,
      enrichmentRate: ((enriched / newLeads.length) * 100).toFixed(1) + "%",
    },
    enrichmentResults: enrichmentResults.map((r) => ({
      customer: r.customer,
      phone: r.phone,
      email: r.email,
      success: r.success,
      cpf: r.cpf || null,
      income: r.income || null,
      error: r.error || null,
    })),
    successfulEnrichments: enrichmentResults.filter((r) => r.success),
    failedEnrichments: enrichmentResults.filter((r) => !r.success),
  };

  // Save report
  const reportPath =
    "/Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api/reports/new-leads-enrichment.json";
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  Final Report");
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );
  console.log(`📊 Total leads fetched: ${report.summary.totalFetched}`);
  console.log(`✅ Already in database: ${report.summary.alreadyInDB}`);
  console.log(`🆕 New leads processed: ${report.summary.newLeads}`);
  console.log(`⚡ Enriched: ${report.summary.enriched}`);
  console.log(`❌ Failed: ${report.summary.failed}`);
  console.log(`💾 Stored: ${report.summary.stored}`);
  console.log(`📈 Enrichment rate: ${report.summary.enrichmentRate}\n`);

  console.log(`📁 Full report saved: ${reportPath}\n`);

  // Summary of successful enrichments
  if (report.successfulEnrichments.length > 0) {
    console.log("✅ Successfully enriched:");
    report.successfulEnrichments.slice(0, 10).forEach((r) => {
      console.log(
        `   - ${r.customer} | CPF: ${r.cpf || "N/A"} | Income: ${r.income ? `R$${r.income.toLocaleString()}` : "N/A"}`,
      );
    });
    if (report.successfulEnrichments.length > 10) {
      console.log(
        `   ... and ${report.successfulEnrichments.length - 10} more`,
      );
    }
    console.log("");
  }

  // Summary of failures
  if (report.failedEnrichments.length > 0) {
    console.log("❌ Failed to enrich:");
    report.failedEnrichments.slice(0, 5).forEach((r) => {
      console.log(`   - ${r.customer} | Error: ${r.error}`);
    });
    if (report.failedEnrichments.length > 5) {
      console.log(`   ... and ${report.failedEnrichments.length - 5} more`);
    }
    console.log("");
  }

  console.log("✅ Workflow complete!\n");
}

main().catch(console.error);
