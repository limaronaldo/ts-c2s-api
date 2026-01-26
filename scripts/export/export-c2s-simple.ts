/**
 * Simple C2S to PostgreSQL export using pg directly
 */

import { Client } from "pg";

const C2S_TOKEN = process.env.C2S_TOKEN || "";
const C2S_URL = "https://api.contact2sale.com/integration/leads";
const LEADS_MB_URL = "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require";

const BATCH_SIZE = 100;
const DELAY_MS = 5000;

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) {
    return digits.slice(2);
  }
  return digits || null;
}

async function fetchLeadsPage(page: number): Promise<{ leads: any[]; total: number }> {
  const url = `${C2S_URL}?limit=${BATCH_SIZE}&page=${page}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${C2S_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 429) {
    throw new Error("RATE_LIMITED");
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
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  C2S → PostgreSQL Export (Simple Version)");
  console.log("═══════════════════════════════════════════════════════════════");

  if (!C2S_TOKEN) {
    console.error("❌ C2S_TOKEN not set");
    process.exit(1);
  }

  const client = new Client({ connectionString: LEADS_MB_URL });
  await client.connect();
  console.log("✅ Connected to PostgreSQL");

  // Get existing count
  const countResult = await client.query("SELECT COUNT(*) as count FROM c2s.leads");
  const existingCount = parseInt(countResult.rows[0].count);
  console.log(`📋 Existing leads: ${existingCount}`);

  // Get total from C2S
  const { total } = await fetchLeadsPage(1);
  const totalPages = Math.ceil(total / BATCH_SIZE);
  console.log(`📊 Total in C2S: ${total.toLocaleString()}`);
  console.log(`📄 Pages: ${totalPages}`);

  const startPage = Math.floor(existingCount / BATCH_SIZE) + 1;
  console.log(`🔄 Starting from page ${startPage}`);

  let inserted = 0;
  let errors = 0;

  for (let page = startPage; page <= totalPages; page++) {
    try {
      const { leads } = await fetchLeadsPage(page);
      
      for (const lead of leads) {
        try {
          await client.query(
            `INSERT INTO c2s.leads (id, internal_id, customer_name, customer_email, customer_phone, customer_phone_normalized, seller_name, seller_email, product_description, lead_source, channel, lead_status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             ON CONFLICT (id) DO NOTHING`,
            [
              lead.id,
              lead.internal_id,
              lead.attributes?.customer?.name || null,
              lead.attributes?.customer?.email || null,
              lead.attributes?.customer?.phone || null,
              normalizePhone(lead.attributes?.customer?.phone),
              lead.attributes?.seller?.name || null,
              lead.attributes?.seller?.email || null,
              lead.attributes?.product?.description || null,
              lead.attributes?.lead_source?.name || null,
              lead.attributes?.channel?.name || null,
              lead.attributes?.lead_status?.alias || null,
              lead.attributes?.created_at || null,
              lead.attributes?.updated_at || null,
            ]
          );
          inserted++;
        } catch (err: any) {
          errors++;
        }
      }

      process.stdout.write(`\r📥 Page ${page}/${totalPages} | Inserted: ${inserted} | Errors: ${errors}   `);
      
      errors = 0; // Reset errors for rate limit tracking
      
      // Delay
      await new Promise((r) => setTimeout(r, DELAY_MS));
    } catch (error: any) {
      if (error.message === "RATE_LIMITED") {
        errors++;
        const waitTime = Math.min(120000, 20000 * errors);
        console.log(`\n⏳ Rate limited. Waiting ${waitTime/1000}s...`);
        await new Promise((r) => setTimeout(r, waitTime));
        page--; // Retry
        if (errors >= 10) {
          console.log(`\n🛑 Too many rate limits. Resume from page ${page}`);
          break;
        }
      } else {
        console.error(`\n❌ Error: ${error.message}`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  // Final count
  const finalResult = await client.query("SELECT COUNT(*) as count FROM c2s.leads");
  console.log(`\n\n✅ Final count: ${finalResult.rows[0].count}`);

  await client.end();
}

main().catch(console.error);
