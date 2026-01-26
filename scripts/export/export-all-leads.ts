import ky from 'ky';
import { writeFileSync } from 'fs';

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_URL = process.env.C2S_URL || 'https://c2s.com.br/api/v1';

console.log('🔍 Buscando TODOS os leads do C2S...\n');

let allLeads: any[] = [];
let page = 1;
const perPage = 100;

while (true) {
  try {
    const response = await ky.get(`${C2S_URL}/integration/leads`, {
      headers: { 'Authorization': `Bearer ${C2S_TOKEN}` },
      searchParams: {
        per_page: perPage,
        page: page,
        order_by: 'created_at',
        order_dir: 'desc',
      },
      timeout: 30000,
    }).json<any>();

    const leads = response.data || [];
    if (leads.length === 0) break;

    allLeads = allLeads.concat(leads);
    console.log(`   Página ${page}: ${leads.length} leads (total: ${allLeads.length})`);

    if (leads.length < perPage) break;
    page++;

    await new Promise(r => setTimeout(r, 300));
  } catch (error: any) {
    console.log(`   ⚠️ Erro na página ${page}: ${error.message}`);
    break;
  }
}

console.log(`\n📊 Total de leads: ${allLeads.length}\n`);

// Prepare CSV data
const csvRows: string[] = [];

// Header
csvRows.push([
  'ID',
  'Nome Cliente',
  'Telefone',
  'Telefone 2',
  'Email',
  'Vendedor',
  'Vendedor ID',
  'Empresa Vendedor',
  'Status',
  'Fonte',
  'Canal',
  'Descrição',
  'Criado Em',
  'Última Atividade',
  'Lido Em',
  'Respondido Em',
  'Arquivado',
  'Fechado',
  'Tags',
  'Produto',
  'Preço',
  'Bairro',
  'Cidade',
].map(h => `"${h}"`).join(','));

// Data rows
for (const lead of allLeads) {
  const attr = lead.attributes || {};
  const customer = attr.customer || {};
  const seller = attr.seller || {};
  const product = attr.product || {};
  const leadSource = attr.lead_source || {};
  const channel = attr.channel || {};
  const leadStatus = attr.lead_status || {};
  const tags = attr.tags || [];

  const row = [
    lead.id || '',
    customer.name || '',
    customer.phone || '',
    customer.phone2 || '',
    customer.email || '',
    seller.name || '',
    seller.id || '',
    seller.company || '',
    leadStatus.name || '',
    leadSource.name || '',
    channel.name || '',
    (attr.description || '').replace(/"/g, '""').replace(/\n/g, ' '),
    attr.created_at || '',
    attr.last_activity_date || '',
    attr.read_at || '',
    attr.replied_at || '',
    attr.archive_details?.archived ? 'Sim' : 'Não',
    attr.done_details?.done ? 'Sim' : 'Não',
    tags.map((t: any) => t.name || t).join('; '),
    (product.description || '').replace(/"/g, '""').replace(/\n/g, ' '),
    product.price || '',
    product.neighbourhood || '',
    product.city || '',
  ];

  csvRows.push(row.map(v => `"${v}"`).join(','));
}

// Save CSV
const csvPath = '/Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api/exports/all-leads.csv';
writeFileSync(csvPath, csvRows.join('\n'), 'utf-8');
console.log(`✅ CSV salvo em: ${csvPath}`);

// Collect seller stats
const sellerStats: Record<string, {
  id: string;
  count: number;
  company: string;
  statuses: Record<string, number>;
  leads: any[];
}> = {};

allLeads.forEach((lead: any) => {
  const seller = lead.attributes?.seller;
  const status = lead.attributes?.lead_status?.name || 'N/A';

  if (seller?.name) {
    if (!sellerStats[seller.name]) {
      sellerStats[seller.name] = {
        id: seller.id,
        count: 0,
        company: seller.company || '',
        statuses: {},
        leads: [],
      };
    }
    sellerStats[seller.name].count++;
    sellerStats[seller.name].statuses[status] = (sellerStats[seller.name].statuses[status] || 0) + 1;
    sellerStats[seller.name].leads.push(lead);
  }
});

console.log('\n👥 TODOS OS VENDEDORES:\n');
console.log('═'.repeat(70));

const sortedSellers = Object.entries(sellerStats).sort((a, b) => b[1].count - a[1].count);

for (const [name, data] of sortedSellers) {
  const tainaraMatch = name.toLowerCase().includes('tainara') ? ' ⭐ ENCONTRADA!' : '';
  console.log(`${name}${tainaraMatch}`);
  console.log(`   ID: ${data.id} | Leads: ${data.count} | ${data.company}`);
  console.log(`   Status: ${Object.entries(data.statuses).map(([s, c]) => `${s}(${c})`).join(', ')}`);
}

// Check for Tainara
const tainara = sortedSellers.find(([name]) => name.toLowerCase().includes('tainara'));

if (tainara) {
  const [name, data] = tainara;

  console.log('\n' + '═'.repeat(70));
  console.log(`\n🎯 RELATÓRIO: ${name}\n`);
  console.log('═'.repeat(70));

  console.log(`\n📊 RESUMO:`);
  console.log(`   Total de Leads: ${data.count}`);
  console.log(`   Empresa: ${data.company}`);
  console.log(`   ID: ${data.id}`);

  console.log(`\n📋 STATUS DOS LEADS:`);
  for (const [status, count] of Object.entries(data.statuses).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / data.count) * 100).toFixed(1);
    console.log(`   ${status}: ${count} (${pct}%)`);
  }

  console.log(`\n📝 LISTA DE LEADS:\n`);

  for (const lead of data.leads) {
    const attr = lead.attributes || {};
    const customer = attr.customer || {};
    const status = attr.lead_status?.name || 'N/A';
    const createdAt = new Date(attr.created_at).toLocaleDateString('pt-BR');
    const desc = (attr.description || '').substring(0, 60);

    console.log(`   👤 ${customer.name || 'N/A'}`);
    console.log(`      📱 ${customer.phone || 'N/A'} | ✉️ ${customer.email || 'N/A'}`);
    console.log(`      📋 ${status} | 📅 ${createdAt}`);
    console.log(`      📝 ${desc}${desc.length >= 60 ? '...' : ''}`);
    console.log('');
  }

  // Save Tainara's leads to separate CSV
  const tainaraCsvRows: string[] = [csvRows[0]]; // header
  for (const lead of data.leads) {
    const idx = allLeads.indexOf(lead);
    if (idx >= 0) {
      tainaraCsvRows.push(csvRows[idx + 1]);
    }
  }

  const tainaraCsvPath = '/Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api/exports/leads-tainara.csv';
  writeFileSync(tainaraCsvPath, tainaraCsvRows.join('\n'), 'utf-8');
  console.log(`\n✅ CSV da Tainara salvo em: ${tainaraCsvPath}`);

} else {
  console.log('\n⚠️ Tainara NÃO encontrada nos leads.');
  console.log('   Pode estar com nome diferente ou sem leads atribuídos.');
}

console.log('\n' + '═'.repeat(70));
console.log(`\n📁 Arquivos exportados:`);
console.log(`   - ${csvPath}`);
console.log('');
