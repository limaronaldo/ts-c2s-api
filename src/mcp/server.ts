import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { container } from "../container";
import { getAllTools, handleToolCall } from "./tools";
import { getAllResources, handleResourceRead } from "./resources";
import { logger } from "../utils/logger";

/**
 * Create and configure the MCP server for ts-c2s-api
 * Exposes lead enrichment, CPF discovery, and statistics tools
 */
export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "c2s-enrichment",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: getAllTools(),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info({ tool: name, args }, "[MCP] Tool called");

    try {
      const result = await handleToolCall(name, args || {}, container);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error({ tool: name, error: errorMessage }, "[MCP] Tool error");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: errorMessage }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  // Register resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: getAllResources(),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    logger.info({ uri }, "[MCP] Resource read");

    try {
      const result = await handleResourceRead(uri, container);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error({ uri, error: errorMessage }, "[MCP] Resource error");
      throw error;
    }
  });

  return server;
}

/**
 * Start the MCP server with stdio transport
 */
export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  logger.info("[MCP] Starting c2s-enrichment MCP server...");

  await server.connect(transport);

  logger.info("[MCP] Server connected and ready");
}
