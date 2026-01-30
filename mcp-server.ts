#!/usr/bin/env bun
/**
 * MCP Server Entry Point for ts-c2s-api
 *
 * This server exposes lead enrichment capabilities via MCP protocol.
 * Run with: bun run mcp-server.ts
 *
 * Configure in Claude Code (~/.claude/mcp.json):
 * {
 *   "mcpServers": {
 *     "c2s-enrichment": {
 *       "command": "bun",
 *       "args": ["run", "mcp-server.ts"],
 *       "cwd": "/path/to/ts-c2s-api"
 *     }
 *   }
 * }
 */

import { startMcpServer } from "./src/mcp/server";

// Start the MCP server
startMcpServer().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
