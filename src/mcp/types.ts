// MCP Type Definitions
// Centralized types for MCP server

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../container";

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer,
) => Promise<unknown>;

/**
 * Resource definition
 */
export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/**
 * Resource handler function signature
 */
export type ResourceHandler = (
  uri: string,
  container: ServiceContainer,
) => Promise<unknown>;

/**
 * Standard tool response
 */
export interface ToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    timestamp: string;
    duration?: number;
  };
}

/**
 * Tool category for organization
 */
export type ToolCategory =
  | "enrichment"
  | "discovery"
  | "leads"
  | "stats"
  | "property"
  | "quality"
  | "reports"
  | "risk"
  | "analysis"
  | "c2s"
  | "domain"
  | "cnpj"
  | "insights"
  | "tier"
  | "search"
  | "monitor";

/**
 * Extended tool definition with category
 */
export interface CategorizedTool extends Tool {
  category?: ToolCategory;
}

// Re-export SDK types for convenience
export type { Tool } from "@modelcontextprotocol/sdk/types.js";
