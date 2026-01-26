import { getDb } from '../src/db/client';
import { googleAdsLeads, parties } from '../src/db/schema';
import { desc, eq, isNotNull, sql } from 'drizzle-orm';

const db = getDb();

// Get leads with party data (only enriched ones)
const leads = await db
  .select({
    leadId: googleAdsLeads.leadId,
    c2sCustomerId: googleAdsLeads.c2sCustomerId,
    createdAt: googleAdsLeads.createdAt,
    name: parties.name,
    cpfCnpj: parties.cpfCnpj,
    income: parties.income,
    netWorth: parties.netWorth,
    occupation: parties.occupation,
  })
  .from(googleAdsLeads)
  .innerJoin(parties, eq(googleAdsLeads.partyId, parties.id))
  .orderBy(desc(googleAdsLeads.createdAt))
  .limit(18);

console.log('📊 RESUMO DOS 18 ÚLTIMOS LEADS ENRIQUECIDOS\n');
console.log('═'.repeat(80));

for (const lead of leads) {
  const income = lead.income ? `R$ ${Number(lead.income).toLocaleString('pt-BR')}` : 'N/A';
  const netWorth = lead.netWorth ? `R$ ${Number(lead.netWorth).toLocaleString('pt-BR')}` : 'N/A';

  console.log(`\n👤 ${lead.name || 'Nome não disponível'}`);
  console.log(`   CPF: ${lead.cpfCnpj || 'N/A'}`);
  console.log(`   💰 Renda: ${income}`);
  console.log(`   🏦 Patrimônio: ${netWorth}`);
  console.log(`   💼 Ocupação: ${lead.occupation || 'N/A'}`);
  console.log(`   📅 Criado: ${new Date(lead.createdAt).toLocaleString('pt-BR')}`);
  console.log(`   🔗 C2S ID: ${lead.c2sCustomerId}`);
}

console.log('\n' + '═'.repeat(80));

// Statistics
const incomeValues = leads
  .filter(l => l.income)
  .map(l => Number(l.income));

const avgIncome = incomeValues.length > 0
  ? incomeValues.reduce((a, b) => a + b, 0) / incomeValues.length
  : 0;

const maxIncome = incomeValues.length > 0
  ? Math.max(...incomeValues)
  : 0;

console.log('\n📈 ESTATÍSTICAS:');
console.log(`   Total de leads: ${leads.length}`);
console.log(`   Com renda: ${incomeValues.length}`);
console.log(`   Renda média: R$ ${avgIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
console.log(`   Maior renda: R$ ${maxIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
console.log('');
