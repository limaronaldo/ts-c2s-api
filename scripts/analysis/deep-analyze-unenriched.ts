/**
 * Deep Analysis of Unenriched Leads
 * Categorizes and provides actionable insights
 */

import postgres from "postgres";

const DB_URL = "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require";

const sql = postgres(DB_URL, { ssl: "require" });

// Valid Brazilian DDDs
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
  21, 22, 24, // RJ
  27, 28, // ES
  31, 32, 33, 34, 35, 37, 38, // MG
  41, 42, 43, 44, 45, 46, // PR
  47, 48, 49, // SC
  51, 53, 54, 55, // RS
  61, // DF
  62, 64, // GO
  63, // TO
  65, 66, // MT
  67, // MS
  68, // AC
  69, // RO
  71, 73, 74, 75, 77, // BA
  79, // SE
  81, 82, 83, 84, 85, 86, 87, 88, 89, // NE
  91, 92, 93, 94, 95, 96, 97, 98, 99, // Norte
]);

// Spam/bot patterns
const SPAM_PATTERNS = [
  /painel\s*fama/i,
  /sucesso\s*com\s*vendas/i,
  /ganhe\s*dinheiro/i,
  /renda\s*extra/i,
  /trabalhe\s*em\s*casa/i,
  /marketing\s*digital/i,
  /afiliado/i,
  /curso\s*online/i,
  /investimento/i,
  /cripto/i,
  /bitcoin/i,
  /forex/i,
  /teste\s*teste/i,
  /^teste$/i,
  /^test$/i,
  /^asdf/i,
  /^qwer/i,
];

// Fake phone patterns
const FAKE_PHONE_PATTERNS = [
  /^(\d)\1{10}$/,  // All same digit
  /^12345/,
  /^0{5,}/,
  /^9{5,}/,
];

interface LeadAnalysis {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  source: string | null;
  created_at: Date;
  categories: string[];
  fixable: boolean;
  fix_action: string | null;
}

async function analyzeLeads() {
  console.log("🔍 Deep Analysis of Unenriched Leads\n");
  console.log("=".repeat(60));

  // Get all unenriched leads - using correct column names
  const leads = await sql`
    SELECT 
      l.id,
      l.customer_name as name,
      l.customer_phone as phone,
      l.customer_email as email,
      COALESCE(e.enrichment_status, 'never_tried') as status,
      l.lead_source as source,
      l.created_at
    FROM c2s.leads l
    LEFT JOIN c2s.enriched_leads e ON l.id = e.lead_id
    WHERE e.cpf IS NULL OR e.enrichment_status IN ('unenriched', 'pending', 'invalid_phone')
    ORDER BY l.created_at DESC
  `;

  console.log(`\nTotal unenriched leads: ${leads.length}\n`);

  // Categories
  const categories = {
    spam_bot: [] as LeadAnalysis[],
    invalid_ddd: [] as LeadAnalysis[],
    fake_phone: [] as LeadAnalysis[],
    duplicate_55: [] as LeadAnalysis[],
    short_phone: [] as LeadAnalysis[],
    no_phone: [] as LeadAnalysis[],
    no_name: [] as LeadAnalysis[],
    api_failed: [] as LeadAnalysis[],
    potentially_fixable: [] as LeadAnalysis[],
    unknown: [] as LeadAnalysis[],
  };

  for (const lead of leads) {
    const phone = (lead.phone || "").replace(/\D/g, "");
    const name = (lead.name || "").trim();
    const analysis: LeadAnalysis = {
      id: lead.id,
      name: name,
      phone: phone,
      email: lead.email,
      status: lead.status,
      source: lead.source,
      created_at: lead.created_at,
      categories: [],
      fixable: false,
      fix_action: null,
    };

    // Check for spam/bot
    if (SPAM_PATTERNS.some(p => p.test(name))) {
      analysis.categories.push("spam_bot");
      categories.spam_bot.push(analysis);
      continue;
    }

    // Check for no phone
    if (!phone || phone.length < 8) {
      analysis.categories.push("no_phone");
      categories.no_phone.push(analysis);
      continue;
    }

    // Check for no name (can't do name-based lookup)
    if (!name || name.length < 3) {
      analysis.categories.push("no_name");
      categories.no_name.push(analysis);
      continue;
    }

    // Check for duplicate 55 prefix
    if (phone.startsWith("55") && phone.length >= 13) {
      const withoutPrefix = phone.slice(2);
      const ddd = parseInt(withoutPrefix.slice(0, 2));
      if (VALID_DDDS.has(ddd)) {
        analysis.categories.push("duplicate_55");
        analysis.fixable = true;
        analysis.fix_action = `Normalize phone: ${phone} → ${withoutPrefix}`;
        categories.duplicate_55.push(analysis);
        continue;
      }
    }

    // Check for invalid DDD
    const ddd = parseInt(phone.slice(0, 2));
    if (!VALID_DDDS.has(ddd)) {
      analysis.categories.push("invalid_ddd");
      categories.invalid_ddd.push(analysis);
      continue;
    }

    // Check for fake phone patterns
    if (FAKE_PHONE_PATTERNS.some(p => p.test(phone))) {
      analysis.categories.push("fake_phone");
      categories.fake_phone.push(analysis);
      continue;
    }

    // Check for short phone
    if (phone.length < 10) {
      analysis.categories.push("short_phone");
      categories.short_phone.push(analysis);
      continue;
    }

    // If we get here, phone looks valid but API failed
    // These are potentially fixable via name lookup
    if (name.length >= 5) {
      analysis.categories.push("potentially_fixable");
      analysis.fixable = true;
      analysis.fix_action = "Try CPF lookup by name";
      categories.potentially_fixable.push(analysis);
    } else {
      analysis.categories.push("api_failed");
      categories.api_failed.push(analysis);
    }
  }

  // Print summary
  console.log("\n📊 CATEGORY BREAKDOWN\n");
  console.log("-".repeat(60));
  
  const summaryData = [
    { cat: "Spam/Bot", count: categories.spam_bot.length, fixable: false },
    { cat: "Invalid DDD", count: categories.invalid_ddd.length, fixable: false },
    { cat: "Fake Phone", count: categories.fake_phone.length, fixable: false },
    { cat: "Duplicate 55 Prefix", count: categories.duplicate_55.length, fixable: true },
    { cat: "Short Phone", count: categories.short_phone.length, fixable: false },
    { cat: "No Phone", count: categories.no_phone.length, fixable: false },
    { cat: "No Name", count: categories.no_name.length, fixable: false },
    { cat: "API Failed (short name)", count: categories.api_failed.length, fixable: false },
    { cat: "Potentially Fixable", count: categories.potentially_fixable.length, fixable: true },
  ];

  let totalFixable = 0;
  let totalUnfixable = 0;

  for (const item of summaryData) {
    const pct = ((item.count / leads.length) * 100).toFixed(1);
    const status = item.fixable ? "✅ FIXABLE" : "❌ UNFIXABLE";
    console.log(`${item.cat.padEnd(25)} ${String(item.count).padStart(5)} (${pct.padStart(5)}%) ${status}`);
    
    if (item.fixable) {
      totalFixable += item.count;
    } else {
      totalUnfixable += item.count;
    }
  }

  console.log("-".repeat(60));
  console.log(`${"TOTAL FIXABLE".padEnd(25)} ${String(totalFixable).padStart(5)} (${((totalFixable / leads.length) * 100).toFixed(1).padStart(5)}%)`);
  console.log(`${"TOTAL UNFIXABLE".padEnd(25)} ${String(totalUnfixable).padStart(5)} (${((totalUnfixable / leads.length) * 100).toFixed(1).padStart(5)}%)`);

  // Sample of each category
  console.log("\n\n📝 SAMPLES BY CATEGORY\n");
  
  for (const [catName, catLeads] of Object.entries(categories)) {
    if (catLeads.length === 0) continue;
    
    console.log(`\n--- ${catName.toUpperCase()} (${catLeads.length} leads) ---`);
    const samples = catLeads.slice(0, 3);
    for (const s of samples) {
      console.log(`  ID: ${s.id} | Name: "${s.name.slice(0, 30)}" | Phone: ${s.phone} | Source: ${s.source || 'N/A'}`);
      if (s.fix_action) {
        console.log(`    → Action: ${s.fix_action}`);
      }
    }
  }

  // Source breakdown for spam
  if (categories.spam_bot.length > 0) {
    console.log("\n\n📡 SOURCE BREAKDOWN (Spam/Bot leads)\n");
    const spamBySource = new Map<string, number>();
    for (const lead of categories.spam_bot) {
      const src = lead.source || "unknown";
      spamBySource.set(src, (spamBySource.get(src) || 0) + 1);
    }
    for (const [src, count] of [...spamBySource.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${src.padEnd(30)} ${count}`);
    }
  }

  // Invalid DDDs breakdown
  if (categories.invalid_ddd.length > 0) {
    console.log("\n\n📞 INVALID DDD BREAKDOWN\n");
    const dddCounts = new Map<string, number>();
    for (const lead of categories.invalid_ddd) {
      const ddd = lead.phone.slice(0, 2);
      dddCounts.set(ddd, (dddCounts.get(ddd) || 0) + 1);
    }
    for (const [ddd, count] of [...dddCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`  DDD ${ddd}: ${count} leads`);
    }
  }

  // Recommendations
  console.log("\n\n💡 RECOMMENDATIONS\n");
  console.log("=".repeat(60));
  
  if (categories.duplicate_55.length > 0) {
    console.log(`\n1. NORMALIZE ${categories.duplicate_55.length} PHONES WITH DUPLICATE 55 PREFIX`);
    console.log("   Run: bun run scripts/utils/normalize-phones-ddd55.ts");
  }
  
  if (categories.potentially_fixable.length > 0) {
    console.log(`\n2. RETRY ${categories.potentially_fixable.length} LEADS WITH NAME-BASED LOOKUP`);
    console.log("   These have valid phones but API failed. Try CPF Lookup by name.");
    console.log("   Run: bun run scripts/enrichment/retry-with-name-lookup.ts");
  }
  
  const unfixableCount = categories.spam_bot.length + categories.invalid_ddd.length + 
                         categories.fake_phone.length + categories.no_phone.length + 
                         categories.no_name.length + categories.short_phone.length;
  
  console.log(`\n3. MARK ${unfixableCount} LEADS AS PERMANENTLY UNENRICHABLE`);
  console.log("   These cannot be enriched due to invalid/missing data.");
  
  // Calculate potential new enrichment rate
  const currentTotal = 33692;
  const currentEnriched = 30940;
  const potentialNew = totalFixable;
  const newRate = ((currentEnriched + potentialNew) / currentTotal * 100).toFixed(1);
  
  console.log(`\n📈 POTENTIAL IMPROVEMENT`);
  console.log(`   Current rate: 91.8%`);
  console.log(`   If all fixable leads enriched: ${newRate}%`);
  console.log(`   Potential gain: +${potentialNew} leads`);

  await sql.end();
}

analyzeLeads().catch(console.error);
