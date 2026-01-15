import ky from 'ky';
import { writeFileSync } from 'fs';

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_URL = process.env.C2S_URL || 'https://c2s.com.br/api/v1';

console.log('🔍 Buscando TODOS os leads do C2S (múltiplos filtros)...\n');

let allLeads: Map<string, any> = new Map();

// Different filters to try to get more leads
const filters = [
  { name: 'Novos', params: { status: 'new' } },
  { name: 'Em negociação', params: { status: 'under_negotiation' } },
  { name: 'Arquivados', params: { archived: 'true' } },
  { name: 'Fechados', params: { done: 'true' } },
  { name: 'Todos (sem filtro)', params: {} },
];

for (const filter of filters) {
  let page = 1;

  while (page <= 50) {
    try {
      const response = await ky.get(`${C2S_URL}/integration/leads`, {
        headers: { 'Authorization': `Bearer ${C2S_TOKEN}` },
        searchParams: {
          per_page: 100,
          page: page,
          order_by: 'created_at',
          order_dir: 'desc',
          ...filter.params,
        },
        timeout: 30000,
      }).json<any>();

      const leads = response.data || [];
      if (leads.length === 0) break;

      let newCount = 0;
      for (const lead of leads) {
        if (!allLeads.has(lead.id)) {
          allLeads.set(lead.id, lead);
          newCount++;
        }
      }

      console.log(`   ${filter.name} - Página ${page}: ${leads.length} leads (${newCount} novos, total: ${allLeads.size})`);

      if (leads.length < 100) break;
      page++;

      await new Promise(r => setTimeout(r, 300));
    } catch (error: any) {
      console.log(`   ⚠️ ${filter.name} - Erro na página ${page}: ${error.message}`);
      break;
    }
  }
}

const leadsArray = Array.from(allLeads.values());
console.log(`\n📊 Total de leads únicos: ${leadsArray.length}\n`);

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
for (const lead of leadsArray) {
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

leadsArray.forEach((lead: any) => {
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
console.log('═'.repeat(80));

const sortedSellers = Object.entries(sellerStats).sort((a, b) => b[1].count - a[1].count);

for (const [name, data] of sortedSellers) {
  const tainaraMatch = name.toLowerCase().includes('tainara') ? ' ⭐ ENCONTRADA!' : '';
  console.log(`${name}${tainaraMatch}`);
  console.log(`   ID: ${data.id} | Leads: ${data.count} | ${data.company}`);
  console.log(`   Status: ${Object.entries(data.statuses).map(([s, c]) => `${s}(${c})`).join(', ')}`);
}

// Check for Tainara (or similar names)
const possibleNames = ['tainara', 'taynara', 'tainá', 'taina'];
const tainara = sortedSellers.find(([name]) =>
  possibleNames.some(p => name.toLowerCase().includes(p))
);

if (tainara) {
  const [name, data] = tainara;

  console.log('\n' + '═'.repeat(80));
  console.log(`\n🎯 RELATÓRIO: ${name}\n`);
  console.log('═'.repeat(80));

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
  const leadIds = data.leads.map((l: any) => l.id);

  for (let i = 0; i < leadsArray.length; i++) {
    if (leadIds.includes(leadsArray[i].id)) {
      tainaraCsvRows.push(csvRows[i + 1]);
    }
  }

  const tainaraCsvPath = '/Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api/exports/leads-tainara.csv';
  writeFileSync(tainaraCsvPath, tainaraCsvRows.join('\n'), 'utf-8');
  console.log(`\n✅ CSV da Tainara salvo em: ${tainaraCsvPath}`);

} else {
  console.log('\n' + '═'.repeat(80));
  console.log('\n⚠️ TAINARA NÃO ENCONTRADA nos leads.');
  console.log('   Verifique se o nome está correto ou se ela tem leads atribuídos.');
  console.log('\n   Vendedores disponíveis:');
  sortedSellers.forEach(([name]) => console.log(`   - ${name}`));
}

console.log('\n' + '═'.repeat(80));
console.log(`\n📁 Arquivos exportados:`);
console.log(`   - ${csvPath} (${leadsArray.length} leads)`);
console.log('');
