import { getDb } from '../src/db/client';
import { googleAdsLeads, parties } from '../src/db/schema';
import { desc, eq } from 'drizzle-orm';
import ky from 'ky';

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_URL = process.env.C2S_URL || 'https://c2s.com.br/api/v1';

if (!C2S_TOKEN) {
  console.error('❌ C2S_TOKEN não configurado');
  process.exit(1);
}

const db = getDb();

// Get just 3 leads to debug
const leads = await db
  .select({
    c2sCustomerId: googleAdsLeads.c2sCustomerId,
    name: parties.name,
  })
  .from(googleAdsLeads)
  .innerJoin(parties, eq(googleAdsLeads.partyId, parties.id))
  .orderBy(desc(googleAdsLeads.createdAt))
  .limit(3);

console.log('🔍 DEBUG - Resposta completa do C2S\n');

for (const lead of leads) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`Lead: ${lead.name}`);
  console.log(`C2S ID: ${lead.c2sCustomerId}`);
  console.log('─'.repeat(80));

  try {
    const response = await ky.get(`${C2S_URL}/integration/leads/${lead.c2sCustomerId}`, {
      headers: {
        'Authorization': `Bearer ${C2S_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }).json<any>();

    console.log('\nResposta JSON completa:');
    console.log(JSON.stringify(response, null, 2));

  } catch (error: any) {
    console.log(`\n⚠️ Erro: ${error.message}`);
    if (error.response) {
      const text = await error.response.text();
      console.log('Response body:', text);
    }
  }

  await new Promise(resolve => setTimeout(resolve, 300));
}
