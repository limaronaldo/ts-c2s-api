import ky from 'ky';

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_URL = process.env.C2S_URL || 'https://c2s.com.br/api/v1';

const BUSCA = process.argv[2] || 'Jose Augusto Rosa de Alvarenga';

console.log(`🔍 Buscando lead: "${BUSCA}"...\n`);

// Fetch all leads
let allLeads: any[] = [];
let page = 1;

while (page <= 20) {
  const response = await ky.get(`${C2S_URL}/integration/leads`, {
    headers: { 'Authorization': `Bearer ${C2S_TOKEN}` },
    searchParams: { perpage: 50, page, sort: '-created_at' },
    timeout: 30000,
  }).json<any>();

  const leads = response.data || [];
  if (leads.length === 0) break;
  allLeads = allLeads.concat(leads);

  console.log(`   Página ${page}: ${leads.length} leads (total: ${allLeads.length})`);

  if (leads.length < 50) break;
  page++;
  await new Promise(r => setTimeout(r, 500));
}

// Search by name (case insensitive, partial match)
const searchTerms = BUSCA.toLowerCase().split(' ').filter(t => t.length > 2);

const matches = allLeads.filter((lead: any) => {
  const customerName = (lead.attributes?.customer?.name || '').toLowerCase();
  const description = (lead.attributes?.description || '').toLowerCase();

  // Check if all search terms are found in name or description
  return searchTerms.every(term =>
    customerName.includes(term) || description.includes(term)
  );
});

if (matches.length === 0) {
  // Try partial match
  const partialMatches = allLeads.filter((lead: any) => {
    const customerName = (lead.attributes?.customer?.name || '').toLowerCase();
    const description = (lead.attributes?.description || '').toLowerCase();

    return searchTerms.some(term =>
      customerName.includes(term) || description.includes(term)
    );
  });

  if (partialMatches.length > 0) {
    console.log(`\n⚠️ Nenhum match exato, mas encontrei ${partialMatches.length} match(es) parcial(is):\n`);

    for (const lead of partialMatches.slice(0, 10)) {
      const attr = lead.attributes || {};
      const customer = attr.customer || {};
      const seller = attr.seller || {};

      console.log(`👤 ${customer.name || 'N/A'}`);
      console.log(`   📱 ${customer.phone || '-'} | ✉️ ${customer.email || '-'}`);
      console.log(`   👨‍💼 Vendedor: ${seller.name || '-'}`);
      console.log(`   📋 Status: ${attr.lead_status?.name || '-'}`);
      console.log(`   📅 Criado: ${new Date(attr.created_at).toLocaleDateString('pt-BR')}`);
      console.log(`   📝 ${(attr.description || '-').substring(0, 60)}`);
      console.log('');
    }
  } else {
    console.log(`\n❌ Nenhum lead encontrado com "${BUSCA}" nos últimos ${allLeads.length} leads.`);
  }
} else {
  console.log(`\n✅ Encontrado(s) ${matches.length} lead(s):\n`);

  for (const lead of matches) {
    const attr = lead.attributes || {};
    const customer = attr.customer || {};
    const seller = attr.seller || {};
    const product = attr.product || {};

    console.log('═'.repeat(70));
    console.log(`👤 ${customer.name || 'N/A'}`);
    console.log(`   📱 Telefone: ${customer.phone || '-'}`);
    console.log(`   ✉️  Email: ${customer.email || '-'}`);
    console.log(`   👨‍💼 Vendedor: ${seller.name || '-'} (${seller.company || '-'})`);
    console.log(`   📋 Status: ${attr.lead_status?.name || '-'}`);
    console.log(`   🎯 Fonte: ${attr.lead_source?.name || '-'}`);
    console.log(`   📅 Criado: ${new Date(attr.created_at).toLocaleString('pt-BR')}`);
    console.log(`   📅 Última atividade: ${attr.last_activity_date ? new Date(attr.last_activity_date).toLocaleString('pt-BR') : '-'}`);
    console.log(`   📝 Descrição: ${attr.description || '-'}`);
    console.log(`   🏠 Produto: ${product.description || '-'}`);
    console.log(`   🔗 ID: ${lead.id}`);
    console.log('');
  }
}

console.log(`\n📊 Total de leads pesquisados: ${allLeads.length}`);
