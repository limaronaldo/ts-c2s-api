import ky from 'ky';

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_URL = process.env.C2S_URL || 'https://c2s.com.br/api/v1';

console.log('🔍 Buscando todos os vendedores dos leads recentes...\n');

// Fetch many leads to get unique sellers
let allLeads: any[] = [];
let page = 1;

while (page <= 5) {
  const response = await ky.get(`${C2S_URL}/integration/leads`, {
    headers: { 'Authorization': `Bearer ${C2S_TOKEN}` },
    searchParams: {
      per_page: 100,
      page: page,
      order_by: 'created_at',
      order_dir: 'desc',
    },
  }).json<any>();

  const leads = response.data || [];
  if (leads.length === 0) break;

  allLeads = allLeads.concat(leads);
  console.log(`   Página ${page}: ${leads.length} leads`);

  if (leads.length < 100) break;
  page++;

  await new Promise(r => setTimeout(r, 200));
}

console.log(`\n📊 Total de leads analisados: ${allLeads.length}\n`);

// Extract unique sellers
const sellers: Record<string, { id: string; count: number; company: string }> = {};

allLeads.forEach((lead: any) => {
  const seller = lead.attributes?.seller;
  if (seller?.name) {
    if (!sellers[seller.name]) {
      sellers[seller.name] = {
        id: seller.id,
        count: 0,
        company: seller.company || ''
      };
    }
    sellers[seller.name].count++;
  }
});

console.log('👥 VENDEDORES ENCONTRADOS:\n');
console.log('═'.repeat(70));

const sortedSellers = Object.entries(sellers).sort((a, b) => b[1].count - a[1].count);

for (const [name, data] of sortedSellers) {
  const tainaraMatch = name.toLowerCase().includes('tainara') ? ' ⭐' : '';
  console.log(`${name}${tainaraMatch}`);
  console.log(`   ID: ${data.id} | Leads: ${data.count} | ${data.company}`);
}

console.log('\n' + '═'.repeat(70));
console.log(`\nTotal de vendedores: ${sortedSellers.length}`);
console.log('');
