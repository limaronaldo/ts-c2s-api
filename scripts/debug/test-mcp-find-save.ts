/**
 * Test the new find_and_save_person MCP tool
 * Usage: bun run scripts/debug/test-mcp-find-save.ts <phone> [name]
 */

import { container } from "../../src/container";
import { handleDiscoveryTool } from "../../src/mcp/tools/discovery";

const phone = process.argv[2] || "11999951666";
const name = process.argv[3];

console.log("\n🔍 Testing find_and_save_person MCP tool\n");
console.log("Phone:", phone);
if (name) console.log("Name:", name);
console.log("\n" + "=".repeat(60) + "\n");

const result = await handleDiscoveryTool(
  "find_and_save_person",
  { phone, name },
  container
);

console.log("Result:", JSON.stringify(result, null, 2));

process.exit(0);
