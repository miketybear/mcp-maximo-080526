import { maximoClient } from "../maximo-client.js";
import { GetBudgetCodeInputSchema } from "../types/index.js";
import { defineTool } from "./define-tool.js";

/** Search budget codes (exact or partial match) and return approved / utilized / remaining amounts. */
export const getBudgetCode = defineTool({
  name: "get_budget_code",
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
  errorLabel: "Error fetching budget codes",
  run: (args) => maximoClient.getBudgetCodes(args),
});
