import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { maximoClient } from "../maximo-client.js";

export function register(server: McpServer) {
  server.registerTool("analyze_work_orders_history_by_tag", {
    description: "Searches historical completed or closed Maximo Work Orders by location tag to summary description and analyze material usage. Returns 'wonum', 'description', and a nested 'matusetrans' array.\n\nCRITICAL PROCESSING INSTRUCTIONS:\nDo NOT list or analyze Work Orders individually. You must aggregate all data and format your response into exactly two parts:\n\nWork Order Summary - Summarize all description fields by key points using bullet points.\nMaterial Usage Analysis - Analyze actual material usage collectively across all records, broken down explicitly by item number and description. Provide net quantity for each item number and total line cost for each item number.",
    inputSchema: {
      location: z.string().describe("Tag number for maintenance task of a Work Order, e.g. HT-PM-4415C"),
      limit: z.number().int().min(1).max(100).default(10).describe("Maximum number of records to return"),
    },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    try {
      const results = await maximoClient.searchHistoryWOByTag(args.location, args.limit);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Error analyzing history work orders: ${e.message}` }],
      };
    }
  });
}
