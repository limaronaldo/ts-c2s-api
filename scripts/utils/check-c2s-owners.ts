import { getDb } from '../src/db/client';
import { googleAdsLeads, parties } from '../src/db/schema';
import { desc, eq, isNotNull } from 'drizzle-orm';
import ky from 'ky';

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_URL = process.env.C2S_URL || 'https://c2s.com.br/api/v1';

if (!C2S_TOKEN) {
  console.error('❌ C2S_TOKEN não configurado');
  process.exit(1);
}

const db = getDb();

// Get leads with party data (only enriched ones)
const leads = await db
  .select({
    leadId: googleAdsLeads.leadId,
    c2sCustomerId: googleAdsLeads.c2sCustomerId,
    createdAt: googleAdsLeads.createdAt,
    name: parties.name,
    income: parties.income,
  })
  .from(googleAdsLeads)
  .innerJoin(parties, eq(googleAdsLeads.partyId, parties.id))
  .orderBy(desc(googleAdsLeads.createdAt))
  .limit(18);

console.log('🔍 VERIFICANDO RESPONSÁVEIS NO C2S\n');
console.log('═'.repeat(80));

const owners: Record<string, number> = {};
const leadsWithOwners: Array<{ name: string; income: number; owner: string }> = [];

for (const lead of leads) {
  try {
    const response = await ky.get(`${C2S_URL}/integration/leads/${lead.c2sCustomerId}`, {
      headers: {
        'Authorization': `Bearer ${C2S_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }).json<any>();

    const ownerName = response.data?.owner_name || 'Sem responsável';
    const income = lead.income ? Number(lead.income) : 0;

    owners[ownerName] = (owners[ownerName] || 0) + 1;
    leadsWithOwners.push({
      name: lead.name || 'N/A',
      income,
      owner: ownerName,
    });

    console.log(`\n👤 ${lead.name}`);
    console.log(`   💰 Renda: R$ ${income.toLocaleString('pt-BR')}`);
    console.log(`   👨‍💼 Responsável: ${ownerName}`);

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 200));
  } catch (error: any) {
    console.log(`\n👤 ${lead.name}`);
    console.log(`   ⚠️ Erro ao buscar: ${error.message}`);
  }
}

console.log('\n' + '═'.repeat(80));
console.log('\n📊 DISTRIBUIÇÃO POR RESPONSÁVEL:\n');

const sorted = Object.entries(owners).sort((a, b) => b[1] - a[1]);
for (const [owner, count] of sorted) {
  const percentage = ((count / leads.length) * 100).toFixed(1);
  console.log(`   ${owner}: ${count} leads (${percentage}%)`);
}

// Top leads por responsável
console.log('\n💎 TOP 5 LEADS POR RENDA:\n');
const topLeads = leadsWithOwners
  .filter(l => l.income > 0)
  .sort((a, b) => b.income - a.income)
  .slice(0, 5);

for (const lead of topLeads) {
  console.log(`   ${lead.name} - R$ ${lead.income.toLocaleString('pt-BR')} - ${lead.owner}`);
}

console.log('');
