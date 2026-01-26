import ky from 'ky';

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_URL = process.env.C2S_URL || 'https://c2s.com.br/api/v1';

const BUSCA = (process.argv[2] || 'Alvarenga').toLowerCase();

console.log(`🔍 Buscando lead: "${BUSCA}"...\n`);

// Fetch leads (limit to 1000)
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

  // Check for match as we go
  const found = leads.filter((lead: any) => {
    const name = (lead.attributes?.customer?.name || '').toLowerCase();
    const desc = (lead.attributes?.description || '').toLowerCase();
    return name.includes(BUSCA) || desc.includes(BUSCA);
  });

  if (found.length > 0) {
    console.log(`✅ Encontrado na página ${page}!\n`);
    for (const lead of found) {
      const attr = lead.attributes || {};
      const customer = attr.customer || {};
      const seller = attr.seller || {};

      console.log('═'.repeat(70));
      console.log(`👤 ${customer.name || 'N/A'}`);
      console.log(`   📱 ${customer.phone || '-'} | ✉️ ${customer.email || '-'}`);
      console.log(`   👨‍💼 Vendedor: ${seller.name || '-'}`);
      console.log(`   📋 Status: ${attr.lead_status?.name || '-'}`);
      console.log(`   🎯 Fonte: ${attr.lead_source?.name || '-'}`);
      console.log(`   📅 Criado: ${new Date(attr.created_at).toLocaleString('pt-BR')}`);
      console.log(`   📝 ${attr.description || '-'}`);
      console.log('');
    }
  }

  if (leads.length < 50) break;
  page++;
  await new Promise(r => setTimeout(r, 300));
}

// Final search in all collected leads
const matches = allLeads.filter((lead: any) => {
  const name = (lead.attributes?.customer?.name || '').toLowerCase();
  const desc = (lead.attributes?.description || '').toLowerCase();
  return name.includes(BUSCA) || desc.includes(BUSCA);
});

console.log(`\n📊 Pesquisados ${allLeads.length} leads | Encontrados: ${matches.length} com "${BUSCA}"`);

if (matches.length === 0) {
  console.log(`\n❌ Nenhum lead encontrado com "${BUSCA}".`);
}
