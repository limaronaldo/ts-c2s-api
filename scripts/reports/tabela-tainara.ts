import ky from 'ky';
import { getDb } from '../src/db/client';
import { parties, partyContacts } from '../src/db/schema';
import { eq } from 'drizzle-orm';

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_URL = process.env.C2S_URL || 'https://c2s.com.br/api/v1';
const TAINARA_ID = '7d06c8d445d460b6102c70c32b65c076';

// Fetch leads
let allLeads: any[] = [];
let page = 1;

while (allLeads.length < 500) {
  const response = await ky.get(`${C2S_URL}/integration/leads`, {
    headers: { 'Authorization': `Bearer ${C2S_TOKEN}` },
    searchParams: { perpage: 50, page, sort: '-created_at' },
    timeout: 30000,
  }).json<any>();

  const leads = response.data || [];
  if (leads.length === 0) break;
  allLeads = allLeads.concat(leads);
  if (leads.length < 50) break;
  page++;
  await new Promise(r => setTimeout(r, 500));
}

const tainaraLeads = allLeads.filter((lead: any) =>
  lead.attributes?.seller?.id === TAINARA_ID
);

// Get enrichment data
const db = getDb();

type LeadRow = {
  num: number;
  nome: string;
  telefone: string;
  email: string;
  status: string;
  fonte: string;
  interesse: string;
  data: string;
  renda: string;
  cpf: string;
};

const rows: LeadRow[] = [];

for (let i = 0; i < tainaraLeads.length; i++) {
  const lead = tainaraLeads[i];
  const attr = lead.attributes || {};
  const customer = attr.customer || {};

  let renda = '-';
  let cpf = '-';

  // Try to get enrichment data
  if (customer.phone) {
    const phone = customer.phone.replace(/\D/g, '');
    try {
      const partyData = await db
        .select()
        .from(parties)
        .innerJoin(partyContacts, eq(parties.id, partyContacts.partyId))
        .where(eq(partyContacts.value, phone))
        .limit(1);

      if (partyData.length > 0) {
        const party = partyData[0].parties;
        renda = party.income ? `R$ ${Number(party.income).toLocaleString('pt-BR')}` : '-';
        cpf = party.cpfCnpj || '-';
      }
    } catch (e) {}
  }

  rows.push({
    num: i + 1,
    nome: customer.name || 'N/A',
    telefone: customer.phone || '-',
    email: customer.email || '-',
    status: attr.lead_status?.name || '-',
    fonte: attr.lead_source?.name || '-',
    interesse: (attr.description || '-').substring(0, 35),
    data: new Date(attr.created_at).toLocaleDateString('pt-BR'),
    renda,
    cpf,
  });
}

// Sort: Em negociação first, then by date desc
rows.sort((a, b) => {
  if (a.status === 'Em negociação' && b.status !== 'Em negociação') return -1;
  if (b.status === 'Em negociação' && a.status !== 'Em negociação') return 1;
  return 0;
});

// Print table
console.log('\n📊 LEADS DA TAINARA ARAUJO RIBEIRO (19 leads)\n');
console.log('┌────┬────────────────────────────┬─────────────────┬─────────────────────────────────┬────────────────┬─────────────────┬─────────────────────────────────────┬────────────┬────────────────┬───────────────┐');
console.log('│ #  │ Nome                       │ Telefone        │ Email                           │ Status         │ Fonte           │ Interesse                           │ Data       │ Renda          │ CPF           │');
console.log('├────┼────────────────────────────┼─────────────────┼─────────────────────────────────┼────────────────┼─────────────────┼─────────────────────────────────────┼────────────┼────────────────┼───────────────┤');

for (const row of rows) {
  const statusIcon = row.status === 'Em negociação' ? '🔥' : '📁';
  console.log(
    `│ ${String(row.num).padStart(2)} │ ${row.nome.padEnd(26).substring(0, 26)} │ ${row.telefone.padEnd(15).substring(0, 15)} │ ${row.email.padEnd(31).substring(0, 31)} │ ${statusIcon} ${row.status.padEnd(12).substring(0, 12)} │ ${row.fonte.padEnd(15).substring(0, 15)} │ ${row.interesse.padEnd(35).substring(0, 35)} │ ${row.data.padEnd(10)} │ ${row.renda.padEnd(14).substring(0, 14)} │ ${row.cpf.padEnd(13).substring(0, 13)} │`
  );
}

console.log('└────┴────────────────────────────┴─────────────────┴─────────────────────────────────┴────────────────┴─────────────────┴─────────────────────────────────────┴────────────┴────────────────┴───────────────┘');

// Summary
const ativos = rows.filter(r => r.status === 'Em negociação').length;
const arquivados = rows.filter(r => r.status === 'Arquivado').length;
const comRenda = rows.filter(r => r.renda !== '-').length;

console.log(`\n📈 Resumo: ${ativos} ativos | ${arquivados} arquivados | ${comRenda} com renda enriquecida`);
console.log('');
