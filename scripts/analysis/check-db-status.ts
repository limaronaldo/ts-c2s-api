import postgres from "postgres";

const sql = postgres(
  "postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb?sslmode=require"
);

async function status() {
  console.log("=== Enrichment Status ===\n");

  const result = await sql`
    SELECT 
      enrichment_status,
      COUNT(*) as count
    FROM c2s.enriched_leads
    GROUP BY enrichment_status
    ORDER BY count DESC
  `;

  let total = 0;
  for (const row of result) {
    const emoji =
      row.enrichment_status === "completed"
        ? "✅"
        : row.enrichment_status === "partial"
          ? "⚠️"
          : "❌";
    console.log(`${emoji} ${row.enrichment_status}: ${row.count}`);
    total += parseInt(row.count as string);
  }
  console.log(`\nTotal enriched: ${total}`);

  const remaining = await sql`
    SELECT COUNT(*) as count FROM c2s.leads 
    WHERE id NOT IN (SELECT lead_id FROM c2s.enriched_leads WHERE lead_id IS NOT NULL)
  `;
  console.log(`Remaining to enrich: ${remaining[0].count}`);

  const withCpf = await sql`
    SELECT COUNT(*) as count FROM c2s.enriched_leads WHERE cpf IS NOT NULL
  `;
  const cpfRate = ((parseInt(withCpf[0].count as string) / total) * 100).toFixed(1);
  console.log(`\nWith CPF: ${withCpf[0].count} (${cpfRate}%)`);

  // Recent activity
  const recent = await sql`
    SELECT COUNT(*) as count FROM c2s.enriched_leads 
    WHERE enriched_at > NOW() - INTERVAL '1 hour'
  `;
  console.log(`Enriched in last hour: ${recent[0].count}`);

  await sql.end();
}

status().catch(console.error);
