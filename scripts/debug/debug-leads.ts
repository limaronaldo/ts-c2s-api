import { getConfig } from "../src/config";

const config = getConfig();

async function main() {
  const response = await fetch(`${config.C2S_URL}/integration/leads?limit=5`, {
    headers: {
      Authorization: `Bearer ${config.C2S_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();
  console.log("Response structure:", JSON.stringify(data, null, 2).slice(0, 3000));
}

main().catch(console.error);
