import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";
import { enrichmentTools, handleEnrichmentTool } from "./enrichment";
import { discoveryTools, handleDiscoveryTool } from "./discovery";
import { leadTools, handleLeadTool } from "./leads";
import { statsTools, handleStatsTool } from "./stats";

// Collect all tool definitions
export function getAllTools(): Tool[] {
  return [...enrichmentTools, ...discoveryTools, ...leadTools, ...statsTools];
}

// Route tool calls to appropriate handlers
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
): Promise<unknown> {
  // Enrichment tools
  if (enrichmentTools.some((t) => t.name === name)) {
    return handleEnrichmentTool(name, args, container);
  }

  // Discovery tools
  if (discoveryTools.some((t) => t.name === name)) {
    return handleDiscoveryTool(name, args, container);
  }

  // Lead tools
  if (leadTools.some((t) => t.name === name)) {
    return handleLeadTool(name, args, container);
  }

  // Stats tools
  if (statsTools.some((t) => t.name === name)) {
    return handleStatsTool(name, args, container);
  }

  throw new Error(`Unknown tool: ${name}`);
}
