/**
 * Simple workflow: Fetch new leads → Store → Report
 * (Skip enrichment for now since we can enrich them later via existing batch scripts)
 */

import { C2SService, type C2SLead } from "../../src/services/c2s.service";
import { neon } from "@neondatabase/serverless";
import { writeFileSync } from "fs";

const LEADS_DB_URL = process.env.LEADS_DB_URL ||
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb";

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');

  if (digits.length >= 12 && digits.startsWith('55')) {
    return digits.slice(2);
  }

  return digits || null;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Store New Leads + Generate Report');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const c2sService = new C2SService();
  const sql = neon(LEADS_DB_URL);

  // Step 1: Fetch last 200 leads
  console.log('📥 Fetching last 200 leads from C2S...\n');

  const allLeads: C2SLead[] = [];
  for (let page = 1; page <= 4; page++) {
    const response = await c2sService.getLeads({
      page,
      perpage: 50,
      sort: '-created_at',
    });

    allLeads.push(...(response.data || []));
    console.log(`   Page ${page}: ${response.data?.length || 0} leads`);

    if (page < 4) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n✅ Fetched ${allLeads.length} leads\n`);

  // Step 2: Find new leads
  console.log('🔍 Checking which leads are new...\n');

  const leadIds = allLeads.map(l => l.id);
  const existingLeads = await sql`
    SELECT id FROM c2s.leads WHERE id = ANY(${leadIds})
  `;

  const existingIds = new Set(existingLeads.map((r: any) => r.id));
  const newLeads = allLeads.filter(l => !existingIds.has(l.id));

  console.log(`   Already in database: ${existingIds.size}`);
  console.log(`   🆕 New leads: ${newLeads.length}\n`);

  if (newLeads.length === 0) {
    console.log('✅ No new leads to process!\n');
    return;
  }

  // Step 3: Store new leads
  console.log('💾 Storing new leads in database...\n');

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
        created_at, updated_at
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
        ${attr.updated_at || lead.updated_at}
      )
      ON CONFLICT (id) DO NOTHING
    `;
    stored++;
    process.stdout.write(`\r   Stored ${stored}/${newLeads.length} leads...`);
  }

  console.log(`\n\n✅ Stored ${stored} new leads\n`);

  // Step 4: Generate report
  console.log('📊 Generating report...\n');

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFetched: allLeads.length,
      alreadyInDB: existingIds.size,
      newLeadsStored: stored,
    },
    newLeads: newLeads.map(lead => {
      const attr = lead.attributes || {};
      const customer = attr.customer || {};
      const seller = attr.seller;
      const leadStatus = attr.lead_status;

      return {
        id: lead.id,
        customer: customer.name || lead.customer,
        phone: customer.phone || lead.phone,
        email: customer.email || lead.email,
        seller: seller?.name,
        status: leadStatus?.name || lead.status,
        created_at: attr.created_at || lead.created_at,
      };
    }),
    sellerDistribution: {} as Record<string, number>,
    statusDistribution: {} as Record<string, number>,
    dateRange: {
      newest: newLeads[0]?.attributes?.created_at || newLeads[0]?.created_at,
      oldest: newLeads[newLeads.length - 1]?.attributes?.created_at || newLeads[newLeads.length - 1]?.created_at,
    }
  };

  // Calculate distributions
  newLeads.forEach(lead => {
    const seller = lead.attributes?.seller?.name || 'Unknown';
    const status = lead.attributes?.lead_status?.name || lead.status || 'Unknown';

    report.sellerDistribution[seller] = (report.sellerDistribution[seller] || 0) + 1;
    report.statusDistribution[status] = (report.statusDistribution[status] || 0) + 1;
  });

  // Save report
  const reportPath = '/Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api/reports/new-leads-report.json';
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Final Report');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`📊 Total leads fetched: ${report.summary.totalFetched}`);
  console.log(`✅ Already in database: ${report.summary.alreadyInDB}`);
  console.log(`🆕 New leads stored: ${report.summary.newLeadsStored}\n`);

  console.log(`📅 Date range:`);
  console.log(`   Newest: ${new Date(report.dateRange.newest).toLocaleString('pt-BR')}`);
  console.log(`   Oldest: ${new Date(report.dateRange.oldest).toLocaleString('pt-BR')}\n`);

  console.log(`👥 Seller distribution:`);
  Object.entries(report.sellerDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([seller, count]) => {
      console.log(`   ${seller}: ${count} leads`);
    });

  console.log(`\n📋 Status distribution:`);
  Object.entries(report.statusDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      console.log(`   ${status}: ${count} leads`);
    });

  console.log(`\n📁 Full report saved: ${reportPath}\n`);
  console.log('✅ Workflow complete!\n');
  console.log('💡 Note: These leads can be enriched later using:');
  console.log('   bun run scripts/enrichment/retry-unenriched.ts\n');
}

main().catch(console.error);
