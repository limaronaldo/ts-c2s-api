/**
 * Reprocess leads by resetting their status
 * This allows the cron job to pick them up again
 *
 * Usage: bun run scripts/reprocess-leads.ts [limit]
 */

import { getDb, schema } from "../src/db/client";
import { desc, sql } from "drizzle-orm";

const limit = parseInt(process.argv[2] || "50");

console.log(`\n🔄 Reprocessando os últimos ${limit} leads...\n`);

const db = getDb();

// Get the last N leads
const leads = await db
  .select({
    id: schema.googleAdsLeads.id,
    leadId: schema.googleAdsLeads.leadId,
    name: schema.googleAdsLeads.name,
    status: schema.googleAdsLeads.enrichmentStatus,
    createdAt: schema.googleAdsLeads.createdAt,
  })
  .from(schema.googleAdsLeads)
  .orderBy(desc(schema.googleAdsLeads.createdAt))
  .limit(limit);

console.log(`📊 Encontrados ${leads.length} leads\n`);

// Count by status
const statusCount: Record<string, number> = {};
for (const lead of leads) {
  const status = lead.status || "null";
  statusCount[status] = (statusCount[status] || 0) + 1;
}

console.log("Status atual:");
for (const [status, count] of Object.entries(statusCount)) {
  console.log(`  - ${status}: ${count}`);
}

// Reset all leads that are not "completed"
const leadsToReset = leads.filter(l => l.status !== "completed");

console.log(`\n🔄 Resetando ${leadsToReset.length} leads (excluindo completed)...\n`);

let resetCount = 0;
for (const lead of leadsToReset) {
  await db
    .update(schema.googleAdsLeads)
    .set({
      enrichmentStatus: null,
      retryCount: 0,
      lastRetryAt: null,
      lastError: null,
      partyId: null,
      enrichedAt: null,
    })
    .where(sql`${schema.googleAdsLeads.id} = ${lead.id}`);

  resetCount++;
  console.log(`  ✅ Reset: ${lead.leadId} (era: ${lead.status})`);
}

console.log(`\n✅ ${resetCount} leads resetados!`);
console.log(`\n⏰ O cron job vai reprocessá-los nos próximos 5 minutos.\n`);

process.exit(0);
