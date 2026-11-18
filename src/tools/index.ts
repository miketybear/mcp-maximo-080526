import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Tool } from "./define-tool.js";
import { searchWorkOrders } from "./search-work-orders.js";
import { getWorkOrder } from "./get-work-order.js";
import { analyzeWorkOrdersHistoryByTag } from "./analyze-work-orders-history-by-tag.js";
import { searchPurchaseOrders } from "./search-purchase-orders.js";
import { searchPurchaseOrdersByBudget } from "./search-purchase-orders-by-budget.js";
import { getPurchaseOrder } from "./get-purchase-order.js";
import { searchVendor } from "./search-vendor.js";
import { getBudgetCode } from "./get-budget-code.js";
import { getExchangeRate } from "./get-exchange-rate.js";
import { convertToUsd } from "./convert-to-usd.js";

/**
 * All tools exposed by the server.
 *
 * To add a new tool: create a file in src/tools/ that exports
 * `defineTool({...})`, import it here and append it to this list.
 */
export const tools: Tool[] = [
  searchWorkOrders,
  getWorkOrder,
  analyzeWorkOrdersHistoryByTag,
  searchPurchaseOrders,
  searchPurchaseOrdersByBudget,
  getPurchaseOrder,
  searchVendor,
  getBudgetCode,
  getExchangeRate,
  convertToUsd,
];

export function registerAllTools(server: McpServer): void {
  for (const tool of tools) tool.register(server);
}
