/**
 * Test enrichment for a single lead to debug failures
 */

import { container } from "../../src/container";

async function test() {
  const enrichmentService = container.enrichment;

  // Test with one of the new leads
  console.log("Testing enrichment for Amanda Negrão de Araújo...\n");

  try {
    const result = await enrichmentService.enrichLead({
      phone: "5543998086229",
      name: "Amanda Negrão de Araújo",
      email: "amanda.negrao@mattosfilho.com.br",
      leadId: "test-lead-1",
    });

    console.log("Result:", JSON.stringify(result, null, 2));

    if (result.enriched) {
      console.log("\n✅ Enrichment successful!");
      console.log(`   CPF: ${result.data?.cpf || "N/A"}`);
      console.log(`   Income: ${result.data?.income || "N/A"}`);
    } else {
      console.log("\n❌ Enrichment failed");
      console.log(`   Reason: ${result.error || "Unknown"}`);
    }
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
  }
}

test().catch(console.error);
