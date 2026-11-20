import { z } from "zod";
import { maximoClient } from "../maximo-client.js";
import { defineTool } from "./define-tool.js";
import { tagScopeSchema } from "../types/index.js";

export const analyzeWorkOrdersHistoryByTag = defineTool({
  name: "analyze_work_orders_history_by_tag",
  description:
    "Searches historical completed or closed Maximo Work Orders by location tag to summarize description " +
    "(by default also WOs that list the tag in their Multi Assets list — see tagScope) " +
    "and analyze material usage. Only works for Work Orders. Returns 'wonum', 'description', and a nested " +
    "'matusetrans' array.\n\n" +
    "CRITICAL PROCESSING INSTRUCTIONS:\n" +
    "Do NOT list or analyze Work Orders individually. You must aggregate all data and format your response " +
    "into exactly two parts:\n\n" +
    "Work Order Summary - Summarize all description fields by key points using bullet points.\n" +
    "Material Usage Analysis - Analyze actual material usage collectively across all records, broken down " +
    "explicitly by item number and description. Provide net quantity for each item number and total line cost " +
    "for each item number.",
  inputSchema: {
    location: z.string().describe("Tag number for maintenance task of a Work Order, e.g. HT-PM-4415C"),
    tagScope: tagScopeSchema,
    limit: z.number().int().min(1).max(100).default(10).describe("Maximum number of records to return"),
    pageno: z.number().int().min(1).optional().describe("Page number to retrieve (default 1). Use responseInfo.totalPages from a previous response to know how many pages exist."),
  },
  errorLabel: "Error analyzing history work orders",
  run: (args) => maximoClient.searchHistoryWOByTag(args.location, args.limit, args.pageno, args.tagScope),
});
