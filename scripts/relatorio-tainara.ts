import ky from 'ky';
import { writeFileSync } from 'fs';
import { getDb } from '../src/db/client';
import { parties, partyContacts, addresses } from '../src/db/schema';
import { eq } from 'drizzle-orm';

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_URL = process.env.C2S_URL || 'https://c2s.com.br/api/v1';

const TAINARA_ID = '7d06c8d445d460b6102c70c32b65c076';

console.log('🔍 Gerando relatório completo da Tainara...\n');

// Fetch all leads and filter by Tainara
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

console.log(`📊 Total de leads da Tainara: ${tainaraLeads.length}\n`);

// Get enrichment data from local DB
const db = getDb();

// Build report
let report = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                    RELATÓRIO DE LEADS - TAINARA ARAUJO RIBEIRO               ║
║                           Gerado em: ${new Date().toLocaleString('pt-BR').padEnd(24)}            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Total de Leads: ${String(tainaraLeads.length).padEnd(58)}║
║  Empresa: Mbras - Grupo Pedro Studart                                        ║
║  ID C2S: ${TAINARA_ID}                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

`;

// Stats
const statusCount: Record<string, number> = {};
const sourceCount: Record<string, number> = {};
const monthCount: Record<string, number> = {};

tainaraLeads.forEach((lead: any) => {
  const status = lead.attributes?.lead_status?.name || 'N/A';
  const source = lead.attributes?.lead_source?.name || 'N/A';
  const month = new Date(lead.attributes?.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  statusCount[status] = (statusCount[status] || 0) + 1;
  sourceCount[source] = (sourceCount[source] || 0) + 1;
  monthCount[month] = (monthCount[month] || 0) + 1;
});

report += `
┌──────────────────────────────────────────────────────────────────────────────┐
│                              RESUMO ESTATÍSTICO                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  STATUS DOS LEADS:                                                           │
`;

for (const [status, count] of Object.entries(statusCount).sort((a, b) => b[1] - a[1])) {
  const pct = ((count / tainaraLeads.length) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(count / tainaraLeads.length * 20));
  report += `│    ${status.padEnd(20)} ${String(count).padStart(3)} (${pct.padStart(5)}%) ${bar.padEnd(20)} │\n`;
}

report += `│                                                                              │
│  FONTE DOS LEADS:                                                            │
`;

for (const [source, count] of Object.entries(sourceCount).sort((a, b) => b[1] - a[1])) {
  const pct = ((count / tainaraLeads.length) * 100).toFixed(1);
  report += `│    ${source.padEnd(25).substring(0, 25)} ${String(count).padStart(3)} (${pct.padStart(5)}%)                        │\n`;
}

report += `│                                                                              │
│  LEADS POR MÊS:                                                              │
`;

for (const [month, count] of Object.entries(monthCount).sort((a, b) => {
  const dateA = new Date(a[0]);
  const dateB = new Date(b[0]);
  return dateB.getTime() - dateA.getTime();
})) {
  report += `│    ${month.padEnd(25)} ${String(count).padStart(3)} leads                                  │\n`;
}

report += `└──────────────────────────────────────────────────────────────────────────────┘

`;

// Detailed leads - Active first
const activeLeads = tainaraLeads.filter((l: any) => l.attributes?.lead_status?.name === 'Em negociação');
const archivedLeads = tainaraLeads.filter((l: any) => l.attributes?.lead_status?.name === 'Arquivado');
const otherLeads = tainaraLeads.filter((l: any) =>
  l.attributes?.lead_status?.name !== 'Em negociação' &&
  l.attributes?.lead_status?.name !== 'Arquivado'
);

report += `
┌──────────────────────────────────────────────────────────────────────────────┐
│                         🔥 LEADS ATIVOS (EM NEGOCIAÇÃO)                      │
├──────────────────────────────────────────────────────────────────────────────┤
`;

if (activeLeads.length === 0) {
  report += `│  Nenhum lead ativo no momento                                               │\n`;
} else {
  for (let i = 0; i < activeLeads.length; i++) {
    const lead = activeLeads[i];
    const attr = lead.attributes || {};
    const customer = attr.customer || {};
    const createdAt = new Date(attr.created_at).toLocaleDateString('pt-BR');
    const lastActivity = attr.last_activity_date
      ? new Date(attr.last_activity_date).toLocaleDateString('pt-BR')
      : 'N/A';
    const desc = (attr.description || '').substring(0, 50);
    const source = attr.lead_source?.name || 'N/A';

    report += `│                                                                              │
│  ${String(i + 1).padStart(2)}. ${(customer.name || 'N/A').padEnd(40).substring(0, 40)} 📅 ${createdAt}       │
│      📱 ${(customer.phone || 'N/A').padEnd(20)} ✉️  ${(customer.email || 'N/A').padEnd(30).substring(0, 30)}│
│      📝 ${desc.padEnd(50).substring(0, 50)}          │
│      🎯 Fonte: ${source.padEnd(25).substring(0, 25)} Última atividade: ${lastActivity}   │
`;

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
          const income = party.income ? `R$ ${Number(party.income).toLocaleString('pt-BR')}` : 'N/A';
          report += `│      💰 Renda Enriquecida: ${income.padEnd(20)} CPF: ${(party.cpfCnpj || 'N/A').padEnd(15)}│\n`;
        }
      } catch (e) {
        // Ignore enrichment errors
      }
    }
  }
}

report += `└──────────────────────────────────────────────────────────────────────────────┘

`;

report += `
┌──────────────────────────────────────────────────────────────────────────────┐
│                           📁 LEADS ARQUIVADOS (${String(archivedLeads.length).padStart(2)})                           │
├──────────────────────────────────────────────────────────────────────────────┤
`;

for (let i = 0; i < archivedLeads.length; i++) {
  const lead = archivedLeads[i];
  const attr = lead.attributes || {};
  const customer = attr.customer || {};
  const createdAt = new Date(attr.created_at).toLocaleDateString('pt-BR');
  const desc = (attr.description || '').substring(0, 45);
  const source = attr.lead_source?.name || 'N/A';

  report += `│  ${String(i + 1).padStart(2)}. ${(customer.name || 'N/A').padEnd(30).substring(0, 30)} 📅 ${createdAt} | ${source.padEnd(15).substring(0, 15)}│
│      📱 ${(customer.phone || 'N/A').padEnd(15)} ✉️ ${(customer.email || 'N/A').padEnd(35).substring(0, 35)} │
│      📝 ${desc.padEnd(60).substring(0, 60)}   │
`;
}

report += `└──────────────────────────────────────────────────────────────────────────────┘
`;

// Save report
const reportPath = '/Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api/exports/relatorio-tainara.txt';
writeFileSync(reportPath, report, 'utf-8');

console.log(report);
console.log(`\n✅ Relatório salvo em: ${reportPath}`);
