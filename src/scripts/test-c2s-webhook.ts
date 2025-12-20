/**
 * Test C2S webhook locally
 *
 * Usage: bun run src/scripts/test-c2s-webhook.ts [url]
 *
 * Default URL: http://localhost:3000/webhook/c2s
 */

const webhookUrl = process.argv[2] || "http://localhost:3000/webhook/c2s";
const webhookSecret = process.env.WEBHOOK_SECRET || "";

// Sample C2S webhook payload (simulates on_create_lead event)
const testPayload = {
  hook_action: "on_create_lead",
  lead: {
    id: "test-lead-" + Date.now(),
    internal_id: 12345678,
    attributes: {
      description: "Test Lead from Webhook Script",
      customer: {
        id: "test-customer-123",
        name: "Marcos Dellis",
        email: "marcos@dellis.com.br",
        phone: "5571999898896",
      },
      seller: {
        id: "seller-123",
        name: "Lucas Melo",
        email: "lm@mbras.com.br",
      },
      lead_source: {
        id: 493,
        name: "Site",
      },
      lead_status: {
        id: 0,
        alias: "new",
        name: "Novo",
      },
      product: {
        id: "product-123",
        description: "Apartamento Bela Vista",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  },
};

async function testWebhook() {
  console.log("========================================");
  console.log("  C2S Webhook Test");
  console.log("========================================");
  console.log(`URL: ${webhookUrl}`);
  console.log(`Lead ID: ${testPayload.lead.id}`);
  console.log(`Customer: ${testPayload.lead.attributes.customer.name}`);
  console.log(`Phone: ${testPayload.lead.attributes.customer.phone}`);
  console.log("");

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (webhookSecret) {
      headers["X-Webhook-Secret"] = webhookSecret;
    }

    const startTime = Date.now();
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(testPayload),
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    console.log(`Status: ${response.status}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Response:`, JSON.stringify(data, null, 2));
    console.log("");

    if (response.ok && data.success) {
      console.log("✅ Webhook test successful!");
      console.log("");
      console.log("The enrichment is running asynchronously.");
      console.log("Check server logs to see enrichment progress.");
    } else {
      console.log("❌ Webhook test failed!");
    }
  } catch (error) {
    console.error("❌ Error testing webhook:", error);
  }
}

testWebhook();
