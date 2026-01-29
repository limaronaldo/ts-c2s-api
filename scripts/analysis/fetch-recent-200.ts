/**
 * Fetch last 200 leads from C2S and check which are new
 */

import { C2SService, type C2SLead } from "../../src/services/c2s.service";
import { neon } from "@neondatabase/serverless";

const LEADS_DB_URL = process.env.LEADS_DB_URL ||
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb";

console.log('═══════════════════════════════════════════════════════════════');
console.log('  Fetch Last 200 Leads from C2S');
console.log('═══════════════════════════════════════════════════════════════\n');

async function main() {
  const c2sService = new C2SService();
  const sql = neon(LEADS_DB_URL);

  // Fetch last 200 leads from C2S (4 pages of 50)
  console.log('📥 Fetching last 200 leads from C2S API...\n');

  const allLeads: C2SLead[] = [];

  for (let page = 1; page <= 4; page++) {
    const response = await c2sService.getLeads({
      page,
      perpage: 50,
      sort: '-created_at', // newest first
    });

    allLeads.push(...(response.data || []));
    console.log(`   Page ${page}: fetched ${response.data?.length || 0} leads`);

    // Rate limiting
    if (page < 4) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n✅ Total fetched: ${allLeads.length} leads\n`);

  // Get all lead IDs from database
  console.log('🔍 Checking which leads exist in database...\n');

  const leadIds = allLeads.map(l => l.id);
  const existingLeads = await sql`
    SELECT id FROM c2s.leads
    WHERE id = ANY(${leadIds})
  `;

  const existingIds = new Set(existingLeads.map((r: any) => r.id));
  const newLeads = allLeads.filter(l => !existingIds.has(l.id));

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Results');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`📊 Total leads fetched: ${allLeads.length}`);
  console.log(`✅ Already in database: ${existingIds.size}`);
  console.log(`🆕 New leads: ${newLeads.length}\n`);

  if (newLeads.length > 0) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  New Leads Details');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (const lead of newLeads) {
      const customer = C2SService.extractCustomerName(lead);
      const phone = C2SService.extractPhone(lead);
      const email = C2SService.extractEmail(lead);
      const status = lead.attributes?.lead_status?.name || lead.status || 'N/A';
      const seller = lead.attributes?.seller?.name || 'N/A';
      const created = lead.attributes?.created_at || lead.created_at;
      const createdDate = new Date(created);

      console.log(`📌 ID: ${lead.id}`);
      console.log(`   Customer: ${customer}`);
      console.log(`   Phone: ${phone || 'N/A'}`);
      console.log(`   Email: ${email || 'N/A'}`);
      console.log(`   Status: ${status}`);
      console.log(`   Seller: ${seller}`);
      console.log(`   Created: ${createdDate.toLocaleString('pt-BR')}`);
      console.log('');
    }
  }

  // Show most recent lead details
  if (allLeads.length > 0) {
    const mostRecent = allLeads[0];
    const created = mostRecent.attributes?.created_at || mostRecent.created_at;
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Most Recent Lead');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`   ID: ${mostRecent.id}`);
    console.log(`   Customer: ${C2SService.extractCustomerName(mostRecent)}`);
    console.log(`   Created: ${new Date(created).toLocaleString('pt-BR')}`);
    console.log(`   In DB: ${existingIds.has(mostRecent.id) ? '✅ Yes' : '❌ No'}\n`);
  }
}

main().catch(console.error);
