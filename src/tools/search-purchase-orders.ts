import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";
import { SearchPurchaseOrdersInputSchema } from "../types/index.js";

/**
 * Tool Behavior Rules:
 *
 * - Filter by vendor (partial match), formno (exact), description (partial),
 *   status (exact), techpic (exact), or potype (exact).
 * - Status MUST NOT be CAN — the client always appends status!="CAN" to the query.
 * - Combine filters when multiple constraints are present.
 * - Avoid unnecessary filters not explicitly requested by user.
 */
export function register(server: McpServer) {
  server.registerTool(
    "search_purchase_orders",
    {
      description:
        "Search Maximo Purchase Orders (POs) by vendor (company), formno, description, status, techpic, or potype. " +
        "Status MUST NOT include CAN — cancelled POs are always excluded automatically. " +
        "Returns summary-level fields (no line items). Use get_purchase_order for full detail.",
      inputSchema: SearchPurchaseOrdersInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const results = await maximoClient.searchPurchaseOrders(args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error searching purchase orders: ${e.message}` }],
        };
      }
    }
  );
}
