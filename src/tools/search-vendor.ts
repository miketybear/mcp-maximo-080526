import { maximoClient } from "../maximo-client.js";
import { SearchVendorInputSchema } from "../types/index.js";
import { defineTool } from "./define-tool.js";

/** Search companies of type 'V' by name (partial match); returns company code and name. */
export const searchVendor = defineTool({
  name: "search_vendor",
  description:
    "Search Maximo Vendors (Companies) by name (partial match, e.g. 'Viet Dan') " +
    "and return their company code/ID. Only returns companies of type 'V' (Vendor). " +
    "If user request to find PO for a specific vendor or company name, always call this tool first, then call search_purchase_orders tool with vendor code from this tool. " +
    "Pagination: The response includes responseInfo with totalCount, totalPages, and pagenum. " +
    "To fetch another page, call again with the same filters and set pageno to the desired page number.",
  inputSchema: SearchVendorInputSchema,
  errorLabel: "Error searching vendors",
  run: (args) => maximoClient.searchVendors(args),
});
