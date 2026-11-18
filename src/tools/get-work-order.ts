import { z } from "zod";
import { maximoClient } from "../maximo-client.js";
import { defineTool } from "./define-tool.js";

export const getWorkOrder = defineTool({
  name: "get_work_order",
  description:
    "Fetch detailed information for a specific Maximo Work Order by its wonum (WONUM). " +
    "Do not use for Purchase Orders (POs), which use ponum (PONUM). " +
    "Note: Always summarize data from the description_longdescription field before presenting/outputting it to the user.",
  inputSchema: {
    wonum: z.string().describe("The exact Work Order number"),
    includeLabor: z.boolean().optional().describe("Set to true to include labor or craft details"),
    includeMaterial: z.boolean().optional().describe("Set to true to include materials or spare parts details"),
    includeTasks: z.boolean().optional().describe("Set to true to include Work order Tasks details"),
  },
  errorLabel: "Error fetching work order",
  async run({ wonum, includeLabor, includeMaterial, includeTasks }) {
    const results = await maximoClient.getWorkOrder(wonum, includeLabor, includeMaterial, includeTasks);
    // oslc.where returns a collection even for one record — unwrap it.
    return results.member?.[0] ?? results;
  },
});
