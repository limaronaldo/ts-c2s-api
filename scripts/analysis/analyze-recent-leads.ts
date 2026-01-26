import { getDb } from '../src/db/client';
import { googleAdsLeads, parties, partyContacts, addresses } from '../src/db/schema';
import { desc, eq, isNotNull } from 'drizzle-orm';

const db = getDb();

// Get leads with party data
const leads = await db
  .select({
    leadId: googleAdsLeads.leadId,
    c2sCustomerId: googleAdsLeads.c2sCustomerId,
    enrichmentStatus: googleAdsLeads.enrichmentStatus,
    createdAt: googleAdsLeads.createdAt,
    partyId: googleAdsLeads.partyId,
    // Party data
    name: parties.name,
    cpfCnpj: parties.cpfCnpj,
    income: parties.income,
    netWorth: parties.netWorth,
    occupation: parties.occupation,
    educationLevel: parties.educationLevel,
    birthDate: parties.birthDate,
  })
  .from(googleAdsLeads)
  .leftJoin(parties, eq(googleAdsLeads.partyId, parties.id))
  .where(isNotNull(googleAdsLeads.partyId))
  .orderBy(desc(googleAdsLeads.createdAt))
  .limit(18); // Only enriched leads

// Get contacts and addresses for each lead
for (const lead of leads) {
  if (lead.partyId) {
    const contacts = await db
      .select()
      .from(partyContacts)
      .where(eq(partyContacts.partyId, lead.partyId));

    const addrs = await db
      .select()
      .from(addresses)
      .where(eq(addresses.partyId, lead.partyId));

    (lead as any).contacts = contacts;
    (lead as any).addresses = addrs;
  }
}

console.log(JSON.stringify(leads, null, 2));
