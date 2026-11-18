import { maximoClient } from "../maximo-client.js";
import { SearchPurchaseOrdersByBudgetInputSchema } from "../types/index.js";
import { defineTool } from "./define-tool.js";

/** Search POs by the budget code of their line items (partial match); CAN POs always excluded. */
export const searchPurchaseOrdersByBudget = defineTool({
  name: "search_purchase_orders_by_budget",
  description:
    "Search Maximo Purchase Orders (POs) by their line item budget code. " +
    "Supports wildcard/partial match (e.g. 'BD1-O3203-2026-01' or 'BD1-O3203-2026'). " +
    "Status MUST NOT include CAN — cancelled POs are always excluded automatically. " +
    "Returns summary-level fields. " +
    "Pagination: The response includes responseInfo with totalCount, totalPages, and pagenum. " +
    "To fetch another page, call again with the same filters and set pageno to the desired page number.",
  inputSchema: SearchPurchaseOrdersByBudgetInputSchema,
  errorLabel: "Error searching purchase orders by budget",
  run: (args) => maximoClient.searchPurchaseOrdersByBudget(args),
});
