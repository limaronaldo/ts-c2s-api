import { C2SService } from "../../src/services/c2s.service";

async function test() {
  const c2s = new C2SService();

  console.log('Testing C2S API connection...\n');

  try {
    const response = await c2s.getLeads({ page: 1, perpage: 5 });

    console.log(`Total leads in C2S: ${response.meta?.total || 0}`);
    console.log(`Fetched: ${response.data?.length || 0} leads\n`);

    if (response.data && response.data.length > 0) {
      const lead = response.data[0];
      console.log('Sample lead:');
      console.log(`  ID: ${lead.id}`);
      console.log(`  Customer: ${C2SService.extractCustomerName(lead)}`);
      console.log(`  Phone: ${C2SService.extractPhone(lead)}`);
      console.log(`  Email: ${C2SService.extractEmail(lead)}`);
      console.log(`  Status: ${lead.attributes?.lead_status?.name || lead.status}`);
      console.log(`  Created: ${lead.attributes?.created_at || lead.created_at}`);
      console.log(`  Updated: ${lead.attributes?.updated_at || lead.updated_at}`);
    }

    console.log('\n✅ Connection successful!');
  } catch (error: any) {
    console.error('\n❌ Connection failed:', error.message);
    throw error;
  }
}

test().catch(console.error);
