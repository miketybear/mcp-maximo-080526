import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";
import { GetBudgetCodeInputSchema } from "../types/index.js";

/**
 * Tool Behavior Rules:
 *
 * - Search budget codes by exact or partial match on the budgetcode field.
 * - Returns key budget fields: budgetcode, parentcode, budgetyear, status,
 *   deptcode, custodian, approvedamt, utilizedamt, sbmtremain.
 * - Supports pagination via the pageno parameter.
 */
export function register(server: McpServer) {
  server.registerTool(
    "get_budget_code",
    {
      description:
        "Search Maximo Budget Codes (oslcmxbudget) by budget code — supports exact match (e.g. 'BD1-O3203-2026-01') " +
        "or partial match (e.g. 'BD1-O3203'). " +
        "Use this tool to look up budget details such as: " +
        "approved amount (budget approval, approvedamt), " +
        "utilized/committed amount (utilizedamt), " +
        "remaining submittable amount (budget remaining, uncommitted balance, sbmtremain), " +
        "budget year, status, department code, and custodian. " +
        "Example questions: 'What is the budget approval amount for BD1-O3203-2026-01?', " +
        "'How much budget is remaining for BD1-O3203-2026-01?'. " +
        "Pagination: The response includes responseInfo with totalCount, totalPages, and pagenum. " +
        "To fetch another page, call again with the same filters and set pageno to the desired page number.",
      inputSchema: GetBudgetCodeInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const results = await maximoClient.getBudgetCodes(args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error fetching budget codes: ${e.message}` }],
        };
      }
    }
  );
}
