/**
 * Subscribe to C2S webhook events
 *
 * Usage: bun run src/scripts/subscribe-webhook.ts
 *
 * Environment variables required:
 * - C2S_TOKEN: Your C2S API token
 * - PUBLIC_URL: Your public webhook URL (e.g., https://ts-c2s-api.fly.dev)
 */

const C2S_TOKEN = process.env.C2S_TOKEN;
const C2S_BASE_URL = process.env.C2S_URL || "https://api.contact2sale.com";
const PUBLIC_URL = process.env.PUBLIC_URL;

if (!C2S_TOKEN) {
  console.error("ERROR: C2S_TOKEN environment variable is required");
  process.exit(1);
}

if (!PUBLIC_URL) {
  console.error("ERROR: PUBLIC_URL environment variable is required");
  console.error("Example: PUBLIC_URL=https://ts-c2s-api.fly.dev");
  process.exit(1);
}

const HOOK_ACTIONS = ["on_create_lead", "on_update_lead", "on_close_lead"] as const;
type HookAction = (typeof HOOK_ACTIONS)[number];

async function subscribeToWebhook(hookAction: HookAction): Promise<boolean> {
  const webhookUrl = `${PUBLIC_URL}/webhook/c2s`;

  try {
    const response = await fetch(`${C2S_BASE_URL}/integration/leads/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${C2S_TOKEN}`,
      },
      body: JSON.stringify({
        hook_action: hookAction,
        hook_url: webhookUrl,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`✅ Subscribed to ${hookAction}`);
      console.log(`   URL: ${webhookUrl}`);
      return true;
    } else if (response.status === 422) {
      console.error(`❌ Invalid hook_action: ${hookAction}`);
      console.error(`   Response: ${JSON.stringify(data)}`);
      return false;
    } else {
      console.error(`❌ Failed to subscribe to ${hookAction}: ${response.status}`);
      console.error(`   Response: ${JSON.stringify(data)}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error subscribing to ${hookAction}:`, error);
    return false;
  }
}

async function main() {
  console.log("========================================");
  console.log("  C2S Webhook Subscription");
  console.log("========================================");
  console.log(`Webhook URL: ${PUBLIC_URL}/webhook/c2s`);
  console.log(`C2S API: ${C2S_BASE_URL}`);
  console.log("");

  let successCount = 0;

  for (const hookAction of HOOK_ACTIONS) {
    const success = await subscribeToWebhook(hookAction);
    if (success) successCount++;

    // Rate limiting - 500ms between requests
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("");
  console.log("========================================");
  console.log(`Subscription complete: ${successCount}/${HOOK_ACTIONS.length} successful`);
  console.log("========================================");

  if (successCount === HOOK_ACTIONS.length) {
    console.log("");
    console.log("Next steps:");
    console.log("1. Create a test lead in C2S");
    console.log("2. Check your server logs for webhook events");
    console.log("3. Verify enrichment message appears in C2S lead");
  }
}

main().catch(console.error);
