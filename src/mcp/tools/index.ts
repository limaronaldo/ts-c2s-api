import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";
import { enrichmentTools, handleEnrichmentTool } from "./enrichment";
import { discoveryTools, handleDiscoveryTool } from "./discovery";
import { leadTools, handleLeadTool } from "./leads";
import { statsTools, handleStatsTool } from "./stats";
import { propertyTools, handlePropertyTool } from "./property";
import { qualityTools, handleQualityTool } from "./quality";
import { reportTools, handleReportTool } from "./reports";
import { riskTools, handleRiskTool } from "./risk";
import { analysisTools, handleAnalysisTool } from "./analysis";
import { c2sTools, handleC2STool } from "./c2s";
// Phase 2 tools
import { domainTools, handleDomainTool } from "./domain";
import { cnpjTools, handleCnpjTool } from "./cnpj";
import { insightTools, handleInsightTool } from "./insights";
import { tierTools, handleTierTool } from "./tier";
import { searchTools, handleSearchTool } from "./search";
import { monitorTools, handleMonitorTool } from "./monitor";

// Collect all tool definitions
export function getAllTools(): Tool[] {
  return [
    // Phase 0: Core tools
    ...enrichmentTools,
    ...discoveryTools,
    ...leadTools,
    ...statsTools,
    // Phase 1: Intelligence tools
    ...propertyTools,
    ...qualityTools,
    ...reportTools,
    ...riskTools,
    ...analysisTools,
    ...c2sTools,
    // Phase 2: Advanced tools
    ...domainTools,
    ...cnpjTools,
    ...insightTools,
    ...tierTools,
    ...searchTools,
    ...monitorTools,
  ];
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

  // Property tools
  if (propertyTools.some((t) => t.name === name)) {
    return handlePropertyTool(name, args, container);
  }

  // Quality tools
  if (qualityTools.some((t) => t.name === name)) {
    return handleQualityTool(name, args, container);
  }

  // Report tools
  if (reportTools.some((t) => t.name === name)) {
    return handleReportTool(name, args, container);
  }

  // Risk tools
  if (riskTools.some((t) => t.name === name)) {
    return handleRiskTool(name, args, container);
  }

  // Analysis tools
  if (analysisTools.some((t) => t.name === name)) {
    return handleAnalysisTool(name, args, container);
  }

  // C2S tools
  if (c2sTools.some((t) => t.name === name)) {
    return handleC2STool(name, args, container);
  }

  // Domain tools
  if (domainTools.some((t) => t.name === name)) {
    return handleDomainTool(name, args, container);
  }

  // CNPJ tools
  if (cnpjTools.some((t) => t.name === name)) {
    return handleCnpjTool(name, args, container);
  }

  // Insight tools
  if (insightTools.some((t) => t.name === name)) {
    return handleInsightTool(name, args, container);
  }

  // Tier tools
  if (tierTools.some((t) => t.name === name)) {
    return handleTierTool(name, args, container);
  }

  // Search tools
  if (searchTools.some((t) => t.name === name)) {
    return handleSearchTool(name, args, container);
  }

  // Monitor tools
  if (monitorTools.some((t) => t.name === name)) {
    return handleMonitorTool(name, args, container);
  }

  throw new Error(`Unknown tool: ${name}`);
}
