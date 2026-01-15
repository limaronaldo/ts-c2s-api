import { getDb } from '../src/db/client';
import { googleAdsLeads, parties } from '../src/db/schema';
import { desc, eq } from 'drizzle-orm';
import ky from 'ky';

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_URL = process.env.C2S_URL || 'https://c2s.com.br/api/v1';

const db = getDb();

const leads = await db
  .select({
    c2sCustomerId: googleAdsLeads.c2sCustomerId,
    createdAt: googleAdsLeads.createdAt,
    name: parties.name,
    income: parties.income,
  })
  .from(googleAdsLeads)
  .innerJoin(parties, eq(googleAdsLeads.partyId, parties.id))
  .orderBy(desc(googleAdsLeads.createdAt))
  .limit(18);

console.log('📊 LEADS ENRIQUECIDOS - RESPONSÁVEIS E STATUS\n');
console.log('═'.repeat(90));

const sellers: Record<string, { count: number; totalIncome: number }> = {};
const statuses: Record<string, number> = {};
const results: Array<{ name: string; income: number; seller: string; status: string; replied: boolean }> = [];

for (const lead of leads) {
  try {
    const response = await ky.get(`${C2S_URL}/integration/leads/${lead.c2sCustomerId}`, {
      headers: { 'Authorization': `Bearer ${C2S_TOKEN}` },
    }).json<any>();

    const data = response.data?.attributes;
    const sellerName = data?.seller?.name || 'Sem vendedor';
    const status = data?.lead_status?.name || 'Desconhecido';
    const replied = !!data?.replied_at;
    const income = lead.income ? Number(lead.income) : 0;

    // Track sellers
    if (!sellers[sellerName]) sellers[sellerName] = { count: 0, totalIncome: 0 };
    sellers[sellerName].count++;
    sellers[sellerName].totalIncome += income;

    // Track statuses
    statuses[status] = (statuses[status] || 0) + 1;

    results.push({ name: lead.name || 'N/A', income, seller: sellerName, status, replied });

    const incomeStr = income > 0 ? `R$ ${income.toLocaleString('pt-BR')}` : 'N/A';
    const repliedIcon = replied ? '✅' : '⏳';

    console.log(`\n${repliedIcon} ${lead.name}`);
    console.log(`   💰 ${incomeStr} | 👨‍💼 ${sellerName} | 📋 ${status}`);

    await new Promise(r => setTimeout(r, 150));
  } catch (e: any) {
    console.log(`\n❌ ${lead.name} - Erro: ${e.message}`);
  }
}

console.log('\n' + '═'.repeat(90));

// Stats by seller
console.log('\n👥 DISTRIBUIÇÃO POR VENDEDOR:\n');
const sortedSellers = Object.entries(sellers).sort((a, b) => b[1].count - a[1].count);
for (const [seller, data] of sortedSellers) {
  const avg = data.count > 0 ? data.totalIncome / data.count : 0;
  console.log(`   ${seller}: ${data.count} leads | Renda média: R$ ${avg.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);
}

// Stats by status
console.log('\n📋 STATUS DOS LEADS:\n');
for (const [status, count] of Object.entries(statuses).sort((a, b) => b[1] - a[1])) {
  const pct = ((count / leads.length) * 100).toFixed(0);
  console.log(`   ${status}: ${count} (${pct}%)`);
}

// Replied stats
const repliedCount = results.filter(r => r.replied).length;
console.log(`\n📨 TAXA DE RESPOSTA: ${repliedCount}/${results.length} (${((repliedCount/results.length)*100).toFixed(0)}%)`);

// Top leads
console.log('\n💎 TOP 5 LEADS POR RENDA:\n');
results.sort((a, b) => b.income - a.income).slice(0, 5).forEach((l, i) => {
  const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i];
  console.log(`   ${medal} ${l.name} - R$ ${l.income.toLocaleString('pt-BR')} - ${l.seller} (${l.status})`);
});

console.log('');
