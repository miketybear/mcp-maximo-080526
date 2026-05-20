import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";
import { SearchVendorInputSchema } from "../types/index.js";

/**
 * Tool Behavior Rules:
 *
 * - Search companies by name (partial match, e.g., "Viet Dan Company Limited").
 * - Returns company (ID) and name.
 * - Only returns companies with type = 'V'.
 */
export function register(server: McpServer) {
  server.registerTool(
    "search_vendor",
    {
      description:
        "Search Maximo Vendors (Companies) by name (partial match, e.g. 'Viet Dan') " +
        "and return their company code/ID. Only returns companies of type 'V' (Vendor). " +
        "If user request to find PO for a specific vendor or company name, always call this tool first, then call search_purchase_orders tool with vendor code from this tool.",
      inputSchema: SearchVendorInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const results = await maximoClient.searchVendors(args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error searching vendors: ${e.message}` }],
        };
      }
    }
  );
}
