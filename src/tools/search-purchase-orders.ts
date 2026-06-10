import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";
import { SearchPurchaseOrdersInputSchema } from "../types/index.js";

/**
 * Tool Behavior Rules:
 *
 * Filter selection guide:
 *   - vendor          → partial match on vendor/company code
 *   - formno          → partial match on PO form/reference number
 *   - description     → partial match on PO description text
 *   - status          → WAPPR/APPR/INPRG/WREVCC/WTECHMGR/CLOSE only; CAN is never valid
 *   - techpic         → exact match on Technical PIC user code
 *   - purchaseagent   → exact match on buyer/purchasing agent user code
 *   - potype          → STD or REL (exact match)
 *   - fromDate/toDate → date range on PO order date (orderdate)
 *   - vendeliveryAfter/vendeliveryBefore → date range on vendor expected delivery date
 *
 * General rules:
 *   - Status MUST NOT be CAN — client always appends status!="CAN".
 *   - Combine filters when multiple constraints are present.
 *   - Avoid unnecessary filters not explicitly requested by user.
 *   - Resolve natural-language dates (e.g. "next month") to ISO-8601 before passing.
 */
export function register(server: McpServer) {
  server.registerTool(
    "search_purchase_orders",
    {
      description:
        "Search Maximo Purchase Orders (POs) by any combination of: vendor (company code), formno, description keyword, " +
        "status, Technical PIC (techpic), buyer/purchasing agent (purchaseagent), PO type (potype), " +
        "PO order date range (fromDate / toDate), or vendor expected delivery date range (vendeliveryAfter / vendeliveryBefore). " +
        "CAN (Cancelled) POs are always excluded automatically — never specify status=CAN. " +
        "Returns summary-level fields including purchaseagent and vendeliverydate, but no line items. Use get_purchase_order for full detail. " +
        "Pagination: The response includes responseInfo with totalCount, totalPages, and pagenum. " +
        "To fetch another page, call again with the same filters and set pageno to the desired page number.",
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
