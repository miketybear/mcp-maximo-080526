import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";
import { SearchWorkOrdersInputSchema } from "../types/index.js";

/**
 * Registers the search_work_orders tool on the MCP server.
 * The SDK infers handler arg types directly from inputSchema.
 */
export function register(server: McpServer) {
  server.registerTool("search_work_orders", {
    description: "Search Maximo Work Orders by various criteria. Returns matching records up to the specified limit.",
    inputSchema: SearchWorkOrdersInputSchema,
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const results = await maximoClient.searchWorkOrders(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Error searching work orders: ${e.message}` }],
      };
    }
  });
}
