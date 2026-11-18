import { z } from "zod";
import { maximoClient } from "../maximo-client.js";
import { defineTool } from "./define-tool.js";

/** Returns the full PO header plus all poline (line items). */
export const getPurchaseOrder = defineTool({
  name: "get_purchase_order",
  description:
    "Fetch detailed information for a specific Maximo Purchase Order by its PONUM. " +
    "Returns header fields (vendor, formno, potype, techpic, orderdate, currency, totalcost, vendeliverydate), " +
    "nested budget summary (xbgvposummary: budgetcode, description), " +
    "and all PO line items (itemnum, description, orderqty, unitcost, linecost, receivedqty, budgetcode, linetype).",
  inputSchema: {
    ponum: z.string().describe("The exact Purchase Order number (PONUM)"),
  },
  errorLabel: ({ ponum }) => `Error fetching purchase order ${ponum}`,
  async run({ ponum }) {
    const results = await maximoClient.getPurchaseOrder(ponum);
    return results.member?.[0] ?? results;
  },
});
