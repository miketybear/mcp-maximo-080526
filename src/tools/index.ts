import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register as registerSearchWorkOrders } from "./search-work-orders.js";
import { register as registerGetWorkOrder } from "./get-work-order.js";
import { register as registerAnalyzeWorkOrdersHistory } from "./analyze-work-orders-history-by-tag.js";
import { register as registerSearchPurchaseOrders } from "./search-purchase-orders.js";
import { register as registerSearchPurchaseOrdersByBudget } from "./search-purchase-orders-by-budget.js";
import { register as registerGetPurchaseOrder } from "./get-purchase-order.js";
import { register as registerSearchVendor } from "./search-vendor.js";
import { register as registerGetBudgetCode } from "./get-budget-code.js";
import { register as registerGetExchangeRate } from "./get-exchange-rate.js";
import { register as registerConvertToUsd } from "./convert-to-usd.js";

/**
 * Register all tools on the given MCP server instance.
 *
 * To add a new tool:
 *   1. Create a new file in src/tools/ that exports a register(server) function
 *   2. Import it here
 *   3. Call it below
 *   */
export function registerAllTools(server: McpServer): void {
  registerSearchWorkOrders(server);
  registerGetWorkOrder(server);
  registerAnalyzeWorkOrdersHistory(server);
  registerSearchPurchaseOrders(server);
  registerSearchPurchaseOrdersByBudget(server);
  registerGetPurchaseOrder(server);
  registerSearchVendor(server);
  registerGetBudgetCode(server);
  registerGetExchangeRate(server);
  registerConvertToUsd(server);

  console.log("[registry] Registered 10 tool(s): search_work_orders, get_work_order, analyze_work_orders_history_by_tag, search_purchase_orders, search_purchase_orders_by_budget, get_purchase_order, search_vendor, get_budget_code, get_exchange_rate, convert_to_usd");
}

