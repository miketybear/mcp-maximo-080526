import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";

/**
 * Registers the get_purchase_order tool on the MCP server.
 * Returns the full PO header plus all poline (line items).
 */
export function register(server: McpServer) {
  server.registerTool(
    "get_purchase_order",
    {
      description:
        "Fetch detailed information for a specific Maximo Purchase Order by its PONUM. " +
        "Returns header fields (vendor, formno, potype, techpic, orderdate, currency, totalcost) " +
        "and all PO line items (itemnum, description, quantity, unitcost, linecost, receivedqty).",
      inputSchema: {
        ponum: z.string().describe("The exact Purchase Order number (PONUM)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ ponum }) => {
      try {
        const results = await maximoClient.getPurchaseOrder(ponum);

        // Pull the single PO record from the OSLC member array
        const po = results.member?.[0] ?? results;

        return {
          content: [{ type: "text" as const, text: JSON.stringify(po, null, 2) }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error fetching purchase order ${ponum}: ${e.message}` }],
        };
      }
    }
  );
}
