import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";
import { SearchWorkOrdersInputSchema } from "../types/index.js";

/**
 * Tool Behavior Rules:
 *
 * Filter selection guide:
 *   - location       → use when the user mentions an equipment tag or asset ID (fuzzy match)
 *   - description    → use when the user mentions a job description keyword (fuzzy match)
 *   - status         → WAPPR/APPR/INPRG/SCHED/COMP/CLOSE only; CAN is never valid
 *   - siteid         → use when restricted to a specific plant/site
 *   - bdpocdiscipline → MECH | E&I | PROD | RES; infer from user's team/department keywords
 *   - worktype       → PM | CM | General | PdM | Routine; infer from user's description of the job
 *   - wopriority     → '1'(Low) | '2'(Medium) | '3'(High) | '4'(Urgent)
 *   - schedFinishAfter / schedFinishBefore → use BOTH for a date range, resolve natural-language dates to ISO-8601
 *   - plusgsafetycrit → true for SCE / safety-critical WOs
 *   - plusgcomcrit   → true for PCE / production-critical WOs
 *   - woclass        → always WORKORDER unless user asks for sub-tasks/activities
 *
 * General rules:
 *   - Prefer exact filters over keyword search whenever possible.
 *   - Combine filters when multiple constraints are present.
 *   - Avoid adding filters not explicitly or implicitly requested by the user.
 *   - Default woclass to WORKORDER to exclude activity/task records.
 *   - Status MUST NOT be CAN — it is excluded from the enum entirely.
 */
export function register(server: McpServer) {
  server.registerTool("search_work_orders", {
    description:
      "Search Maximo Work Orders (WOs) by any combination of: equipment tag (location), " +
      "job description keyword (description), status, site (siteid), discipline/team (bdpocdiscipline), " +
      "work type (worktype), priority (wopriority), scheduled finish date range " +
      "(schedFinishAfter / schedFinishBefore), SCE flag (plusgsafetycrit), PCE flag (plusgcomcrit), " +
      "or WO class (woclass). " +
      "Do NOT use this tool for Purchase Orders (POs) or Vendors. " +
      "Status CAN (Cancelled) is always excluded automatically — never specify it. " +
      "Pagination: The response includes responseInfo with totalCount, totalPages, and pagenum. " +
      "To fetch another page, call again with the same filters and set pageno to the desired page number.",
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
