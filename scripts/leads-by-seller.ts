import ky from 'ky';

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_URL = process.env.C2S_URL || 'https://c2s.com.br/api/v1';

const SELLER_NAME = process.argv[2] || 'Tainara';

console.log(`🔍 Buscando leads do(a) ${SELLER_NAME}...\n`);

// Fetch leads from C2S API
const response = await ky.get(`${C2S_URL}/integration/leads`, {
  headers: { 'Authorization': `Bearer ${C2S_TOKEN}` },
  searchParams: {
    per_page: 100,
    order_by: 'created_at',
    order_dir: 'desc',
  },
}).json<any>();

const leads = response.data || [];

// Filter by seller name
const sellerLeads = leads.filter((lead: any) => {
  const sellerName = lead.attributes?.seller?.name || '';
  return sellerName.toLowerCase().includes(SELLER_NAME.toLowerCase());
});

console.log(`📊 Encontrados ${sellerLeads.length} leads com ${SELLER_NAME}\n`);
console.log('═'.repeat(90));

for (const lead of sellerLeads) {
  const attr = lead.attributes;
  const customer = attr.customer || {};
  const status = attr.lead_status?.name || 'N/A';
  const createdAt = new Date(attr.created_at).toLocaleDateString('pt-BR');
  const description = attr.description || '';

  console.log(`\n👤 ${customer.name || 'N/A'}`);
  console.log(`   📱 ${customer.phone || 'N/A'}`);
  console.log(`   ✉️  ${customer.email || 'N/A'}`);
  console.log(`   📋 Status: ${status}`);
  console.log(`   📅 Criado: ${createdAt}`);
  console.log(`   📝 ${description.substring(0, 80)}${description.length > 80 ? '...' : ''}`);
  console.log(`   🔗 ID: ${lead.id}`);
}

console.log('\n' + '═'.repeat(90));

// Summary by status
const statusCount: Record<string, number> = {};
sellerLeads.forEach((lead: any) => {
  const status = lead.attributes?.lead_status?.name || 'N/A';
  statusCount[status] = (statusCount[status] || 0) + 1;
});

console.log('\n📋 RESUMO POR STATUS:\n');
for (const [status, count] of Object.entries(statusCount).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${status}: ${count}`);
}

console.log('');
