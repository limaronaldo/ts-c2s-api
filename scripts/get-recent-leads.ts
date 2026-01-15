import { getDb } from "../src/db/client";
import { googleAdsLeads } from "../src/db/schema";
import { desc } from "drizzle-orm";

const db = getDb();
const leads = await db
  .select({
    id: googleAdsLeads.id,
    leadId: googleAdsLeads.leadId,
    name: googleAdsLeads.name,
    phone: googleAdsLeads.phone,
    email: googleAdsLeads.email,
    campaignName: googleAdsLeads.campaignName,
    enrichmentStatus: googleAdsLeads.enrichmentStatus,
    retryCount: googleAdsLeads.retryCount,
    lastRetryAt: googleAdsLeads.lastRetryAt,
    lastError: googleAdsLeads.lastError,
    createdAt: googleAdsLeads.createdAt,
    enrichedAt: googleAdsLeads.enrichedAt,
    partyId: googleAdsLeads.partyId,
    c2sCustomerId: googleAdsLeads.c2sCustomerId,
  })
  .from(googleAdsLeads)
  .orderBy(desc(googleAdsLeads.createdAt))
  .limit(25);

console.log(JSON.stringify(leads, null, 2));
