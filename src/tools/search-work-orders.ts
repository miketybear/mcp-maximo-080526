import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";
import { SearchWorkOrdersInputSchema } from "../types/index.js";

/**
 * Registers the search_work_orders tool on the MCP server.
 * The SDK infers handler arg types directly from inputSchema.
 */
export function register(server: McpServer) {
  server.registerTool("search_work_orders", {
    description: "Search Maximo Work Orders by various criteria. Returns matching records up to the specified limit. Guidelines: (1) When user searches for 'failure', 'broken', 'repair', 'breakdown', or similar keywords, map the search term to 'description' AND set 'worktype' to 'CM' (Corrective Maintenance). (2) Set 'plusgsafetycrit' (SCE) or 'plusgcomcrit' (PCE) to true if the query asks for SCE/PCE related work orders or assets.",
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
