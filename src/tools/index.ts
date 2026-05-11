import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register as registerSearchWorkOrders } from "./search-work-orders.js";
import { register as registerGetWorkOrder } from "./get-work-order.js";

/**
 * Register all tools on the given MCP server instance.
 *
 * To add a new tool:
 *   1. Create a new file in src/tools/ that exports a register(server) function
 *   2. Import it here
 *   3. Call it below
 */
export function registerAllTools(server: McpServer): void {
  registerSearchWorkOrders(server);
  registerGetWorkOrder(server);

  console.log("[registry] Registered 2 tool(s): search_work_orders, get_work_order");
}
