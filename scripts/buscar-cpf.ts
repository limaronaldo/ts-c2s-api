import { getDb } from '../src/db/client';
import { parties, partyContacts, googleAdsLeads } from '../src/db/schema';
import { eq, like, or } from 'drizzle-orm';

const CPF = process.argv[2] || '10316292702';
const cpfNormalizado = CPF.replace(/\D/g, '');

console.log(`🔍 Buscando CPF: ${CPF} (${cpfNormalizado})...\n`);

const db = getDb();

// Search in parties table
const partyResults = await db
  .select()
  .from(parties)
  .where(or(
    eq(parties.cpfCnpj, cpfNormalizado),
    eq(parties.cpfCnpj, CPF),
    like(parties.cpfCnpj, `%${cpfNormalizado}%`)
  ))
  .limit(5);

if (partyResults.length > 0) {
  console.log('✅ ENCONTRADO NO BANCO LOCAL:\n');

  for (const party of partyResults) {
    console.log('═'.repeat(70));
    console.log(`👤 ${party.name || 'N/A'}`);
    console.log(`   📋 CPF: ${party.cpfCnpj}`);
    console.log(`   💰 Renda: ${party.income ? `R$ ${Number(party.income).toLocaleString('pt-BR')}` : '-'}`);
    console.log(`   🎂 Nascimento: ${party.birthDate ? new Date(party.birthDate).toLocaleDateString('pt-BR') : '-'}`);
    console.log(`   👩 Mãe: ${party.motherName || '-'}`);
    console.log(`   💼 Ocupação: ${party.occupation || '-'}`);
    console.log(`   📅 Cadastrado: ${party.createdAt.toLocaleString('pt-BR')}`);

    // Get contacts
    const contacts = await db
      .select()
      .from(partyContacts)
      .where(eq(partyContacts.partyId, party.id));

    if (contacts.length > 0) {
      console.log(`\n   📞 Contatos:`);
      for (const c of contacts) {
        const icon = c.type === 'phone' ? '📱' : '✉️';
        console.log(`      ${icon} ${c.value}`);
      }
    }

    // Check if linked to a lead
    const linkedLeads = await db
      .select()
      .from(googleAdsLeads)
      .where(eq(googleAdsLeads.partyId, party.id));

    if (linkedLeads.length > 0) {
      console.log(`\n   🔗 Leads vinculados:`);
      for (const lead of linkedLeads) {
        console.log(`      - ${lead.leadId} (${lead.enrichmentStatus}) - ${lead.createdAt.toLocaleDateString('pt-BR')}`);
      }
    }

    console.log('');
  }
} else {
  console.log(`❌ CPF ${CPF} não encontrado no banco local.`);
  console.log('   Este CPF nunca foi enriquecido pelo sistema.');
}

// Also search by name Jose Augusto
console.log('\n🔍 Buscando também por nome "Jose Augusto"...\n');

const nameResults = await db
  .select()
  .from(parties)
  .where(like(parties.name, '%JOSE AUGUSTO%'))
  .limit(10);

if (nameResults.length > 0) {
  console.log(`Encontrados ${nameResults.length} resultado(s):\n`);
  for (const party of nameResults) {
    console.log(`   👤 ${party.name} | CPF: ${party.cpfCnpj || '-'} | Renda: ${party.income ? `R$ ${Number(party.income).toLocaleString('pt-BR')}` : '-'}`);
  }
} else {
  console.log('   Nenhum "Jose Augusto" encontrado no banco local.');
}

console.log('');
