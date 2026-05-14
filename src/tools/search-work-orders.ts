import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";
import { SearchWorkOrdersInputSchema } from "../types/index.js";

/**
 * Tool Behavior Rules:
 *
 * - Prefer exact filters over fuzzy text search whenever possible.
 * - If user mentions an equipment tag, use location.
 * - Combine filters when multiple constraints are present.
 * - Avoid unnecessary filters not explicitly requested by user.
 * - Default woclass to WORKORDER unless task/activity records are requested.
 * - Status MUST NOT include CAN.
 * - For date range requests, use BOTH schedFinishAfter and schedFinishBefore.
 */
export function register(server: McpServer) {
  server.registerTool("search_work_orders", {
    description: "Search Maximo Work Orders (WOs) by various criteria. Returns matching records up to the specified limit. Guidelines: (1) Set 'plusgsafetycrit' (SCE) or 'plusgcomcrit' (PCE) to true if the query asks for SCE/PCE related work orders or assets. (2) woclass defaults to WORKORDER to exclude activity tasks. (3) Status MUST NOT include CAN.",
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
