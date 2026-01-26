import ky from 'ky';

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_URL = process.env.C2S_URL || 'https://c2s.com.br/api/v1';

const SELLER_NAME = process.argv[2] || 'Tainara';

console.log(`🔍 Buscando leads do(a) ${SELLER_NAME}...\n`);

// First, let's list all sellers to find Tainara's ID
const sellersResponse = await ky.get(`${C2S_URL}/integration/sellers`, {
  headers: { 'Authorization': `Bearer ${C2S_TOKEN}` },
}).json<any>();

const sellers = sellersResponse.data || [];
const tainara = sellers.find((s: any) =>
  s.attributes?.name?.toLowerCase().includes(SELLER_NAME.toLowerCase())
);

if (!tainara) {
  console.log(`❌ Vendedor(a) "${SELLER_NAME}" não encontrado(a)\n`);
  console.log('📋 Vendedores disponíveis:\n');
  sellers.slice(0, 30).forEach((s: any) => {
    console.log(`   - ${s.attributes?.name} (${s.id})`);
  });
  process.exit(0);
}

console.log(`✅ Encontrado: ${tainara.attributes.name} (ID: ${tainara.id})\n`);

// Now fetch leads filtering by seller_id
let allLeads: any[] = [];
let page = 1;
const perPage = 100;

while (true) {
  const response = await ky.get(`${C2S_URL}/integration/leads`, {
    headers: { 'Authorization': `Bearer ${C2S_TOKEN}` },
    searchParams: {
      per_page: perPage,
      page: page,
      seller_id: tainara.id,
      order_by: 'created_at',
      order_dir: 'desc',
    },
  }).json<any>();

  const leads = response.data || [];
  if (leads.length === 0) break;

  allLeads = allLeads.concat(leads);
  console.log(`   Página ${page}: ${leads.length} leads (total: ${allLeads.length})`);

  if (leads.length < perPage) break;
  page++;

  // Safety limit
  if (page > 10) break;

  await new Promise(r => setTimeout(r, 200));
}

console.log(`\n📊 Total: ${allLeads.length} leads com ${tainara.attributes.name}\n`);
console.log('═'.repeat(90));

for (const lead of allLeads) {
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
allLeads.forEach((lead: any) => {
  const status = lead.attributes?.lead_status?.name || 'N/A';
  statusCount[status] = (statusCount[status] || 0) + 1;
});

console.log('\n📋 RESUMO POR STATUS:\n');
for (const [status, count] of Object.entries(statusCount).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${status}: ${count}`);
}

console.log('');
