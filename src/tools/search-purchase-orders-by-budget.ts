import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";
import { SearchPurchaseOrdersByBudgetInputSchema } from "../types/index.js";

/**
 * Tool Behavior Rules:
 *
 * - Search purchase orders by the budget code of their line items.
 * - Supports wildcard/partial match (e.g. "BD1-O3203-2026" or "BD1-O3203-2026-01").
 * - Status MUST NOT be CAN — cancelled POs are always excluded automatically.
 * - Returns summary-level fields.
 */
export function register(server: McpServer) {
  server.registerTool(
    "search_purchase_orders_by_budget",
    {
      description:
        "Search Maximo Purchase Orders (POs) by their line item budget code. " +
        "Supports wildcard/partial match (e.g. 'BD1-O3203-2026-01' or 'BD1-O3203-2026'). " +
        "Status MUST NOT include CAN — cancelled POs are always excluded automatically. " +
        "Returns summary-level fields. " +
        "Pagination: The response includes responseInfo with totalCount, totalPages, and pagenum. " +
        "To fetch another page, call again with the same filters and set pageno to the desired page number.",
      inputSchema: SearchPurchaseOrdersByBudgetInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const results = await maximoClient.searchPurchaseOrdersByBudget(args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error searching purchase orders by budget: ${e.message}` }],
        };
      }
    }
  );
}
