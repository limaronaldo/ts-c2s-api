// MCP Server for ts-c2s-api
// Exposes lead enrichment, CPF discovery, and statistics tools
// 26 tools across 9 categories

// Server
export { createMcpServer, startMcpServer } from "./server";

// Tools (26 total)
export { getAllTools, handleToolCall } from "./tools";

// Resources (3 total)
export { getAllResources, handleResourceRead } from "./resources";

// Prompts (future)
export { getAllPrompts, handlePrompt } from "./prompts";

// Types
export type {
  ToolHandler,
  ResourceHandler,
  McpResource,
  ToolResponse,
  ToolCategory,
  CategorizedTool,
  Tool,
} from "./types";
