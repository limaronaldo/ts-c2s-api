/**
 * Export all C2S leads directly to PostgreSQL (leads-mb)
 *
 * Usage: bun run scripts/export-c2s-to-postgres.ts
 */

import postgres from "postgres";

const C2S_TOKEN = process.env.C2S_TOKEN || "";
const C2S_URL = "https://api.contact2sale.com/integration/leads";
const LEADS_MB_URL =
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

const BATCH_SIZE = 100; // C2S API limit per page
const INSERT_BATCH = 100; // Insert after each page fetch
const DELAY_MS = 5000; // 5s delay between requests (C2S is very aggressive with rate limiting)
const START_PAGE = parseInt(process.env.START_PAGE || "1", 10); // Resume from page

interface C2SLead {
  id: string;
  internal_id: number;
  attributes: {
    customer: {
      name: string;
      email: string;
      phone: string;
    };
    seller: {
      name: string;
      email: string;
    };
    product: {
      description: string;
    };
    lead_source: {
      name: string;
    };
    channel: {
      name: string;
    };
    lead_status: {
      alias: string;
    };
    created_at: string;
    updated_at: string;
  };
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  // Remove all non-digits
  const digits = phone.replace(/\D/g, "");
  // Remove country code 55 if present
  if (digits.length === 13 && digits.startsWith("55")) {
    return digits.slice(2);
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return digits.slice(2);
  }
  return digits || null;
}

async function fetchLeadsPage(
  page: number,
): Promise<{ leads: C2SLead[]; total: number }> {
  const url = `${C2S_URL}?limit=${BATCH_SIZE}&page=${page}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${C2S_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 429) {
    throw new Error(`RATE_LIMITED`);
  }

  if (!response.ok) {
    throw new Error(`C2S API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    leads: data.data || [],
    total: data.meta?.total || 0,
  };
}

async function main() {
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  C2S → PostgreSQL (leads-mb) Export");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  if (!C2S_TOKEN) {
    console.error("❌ C2S_TOKEN not set. Run with: C2S_TOKEN=xxx bun run ...");
    process.exit(1);
  }

  // Connect to PostgreSQL
  const sql = postgres(LEADS_MB_URL);
  console.log("✅ Connected to leads-mb PostgreSQL");

  // Get total count
  const { total } = await fetchLeadsPage(1);
  const totalPages = Math.ceil(total / BATCH_SIZE);
  console.log(`📊 Total leads in C2S: ${total.toLocaleString()}`);
  console.log(`📄 Pages to fetch: ${totalPages}`);

  // Check existing leads
  const [{ count: existingCount }] =
    await sql`SELECT COUNT(*) as count FROM c2s.leads`;
  console.log(`📋 Existing leads in DB: ${existingCount}`);
  console.log(`⏱️  Delay between requests: ${DELAY_MS}ms`);

  const startPage =
    START_PAGE > 1
      ? START_PAGE
      : Math.floor(Number(existingCount) / BATCH_SIZE) + 1;
  if (startPage > 1) {
    console.log(`🔄 Resuming from page ${startPage}`);
  }

  let insertedCount = 0;
  let buffer: any[] = [];
  const startTime = Date.now();
  let consecutiveErrors = 0;

  for (let page = startPage; page <= totalPages; page++) {
    try {
      const { leads } = await fetchLeadsPage(page);

      for (const lead of leads) {
        const record = {
          id: lead.id,
          internal_id: lead.internal_id,
          customer_name: lead.attributes.customer?.name || null,
          customer_email: lead.attributes.customer?.email || null,
          customer_phone: lead.attributes.customer?.phone || null,
          customer_phone_normalized: normalizePhone(
            lead.attributes.customer?.phone,
          ),
          seller_name: lead.attributes.seller?.name || null,
          seller_email: lead.attributes.seller?.email || null,
          product_description: lead.attributes.product?.description || null,
          lead_source: lead.attributes.lead_source?.name || null,
          channel: lead.attributes.channel?.name || null,
          lead_status: lead.attributes.lead_status?.alias || null,
          created_at: lead.attributes.created_at || null,
          updated_at: lead.attributes.updated_at || null,
        };

        buffer.push(record);
      }

      // Insert immediately after each page fetch
      if (buffer.length > 0) {
        await sql`
          INSERT INTO c2s.leads ${sql(buffer)}
          ON CONFLICT (id) DO NOTHING
        `;
        insertedCount += buffer.length;
        buffer = [];
      }

      // Progress
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (page * BATCH_SIZE) / elapsed;
      const eta = ((total - page * BATCH_SIZE) / rate / 60).toFixed(1);

      process.stdout.write(
        `\r📥 Page ${page}/${totalPages} | ${(page * BATCH_SIZE).toLocaleString()}/${total.toLocaleString()} leads | ${rate.toFixed(0)}/s | ETA: ${eta}min   `,
      );

      // Reset error counter on success
      consecutiveErrors = 0;

      // Delay between requests to avoid rate limiting
      await new Promise((r) => setTimeout(r, DELAY_MS));
    } catch (error: any) {
      consecutiveErrors++;

      if (error.message === "RATE_LIMITED") {
        // Flush buffer before waiting to avoid data loss
        if (buffer.length > 0) {
          await sql`INSERT INTO c2s.leads ${sql(buffer)} ON CONFLICT (id) DO NOTHING`;
          insertedCount += buffer.length;
          buffer = [];
          console.log(
            `\n💾 Flushed ${insertedCount} leads to DB before rate limit wait`,
          );
        }

        if (consecutiveErrors >= 10) {
          console.log(`\n🛑 Too many rate limits. Stopping at page ${page}.`);
          console.log(
            `💡 Resume with: START_PAGE=${page} bun run scripts/export-c2s-to-postgres.ts`,
          );
          break;
        }

        const waitTime = Math.min(180000, 20000 * consecutiveErrors); // Exponential backoff up to 3min
        console.log(
          `\n⏳ Rate limited on page ${page}. Waiting ${waitTime / 1000}s... (attempt ${consecutiveErrors})`,
        );
        await new Promise((r) => setTimeout(r, waitTime));
        page--; // Retry this page
      } else {
        console.error(`\n❌ Error on page ${page}:`, error.message);
        if (consecutiveErrors >= 5) {
          console.error(
            `\n🛑 Too many consecutive errors. Stopping at page ${page}.`,
          );
          console.log(
            `💡 Resume with: START_PAGE=${page} bun run scripts/export-c2s-to-postgres.ts`,
          );
          break;
        }
        await new Promise((r) => setTimeout(r, 3000));
        page--; // Retry this page
      }
    }
  }

  // Insert remaining buffer
  if (buffer.length > 0) {
    await sql`
      INSERT INTO c2s.leads ${sql(buffer)}
      ON CONFLICT (id) DO NOTHING
    `;
    insertedCount += buffer.length;
  }

  // Final count
  const [{ count: finalCount }] =
    await sql`SELECT COUNT(*) as count FROM c2s.leads`;
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log("\n");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("  ✅ EXPORT COMPLETE");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(`  📊 Total leads in DB: ${finalCount.toLocaleString()}`);
  console.log(`  ⏱️  Duration: ${elapsed} minutes`);
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );

  await sql.end();
}

main().catch(console.error);
