import { z } from "zod";
import { WO_WORKTYPE } from "../constants.js";
import { maximoClient } from "../maximo-client.js";
import { tagScopeSchema } from "../types/index.js";
import { defineTool } from "./define-tool.js";

export const summarizeWorkOrdersByTag = defineTool({
  name: "summarize_work_orders_by_tag",
  description:
    "Maintenance statistics for ONE equipment tag: how many Work Orders (counts by worktype, status and year, " +
    "top PM numbers), the last completed PM and last completed WO, and the open WOs ordered by scheduled finish. " +
    "Counts WOs whose own location is the tag AND, by default, WOs that list the tag in their Multi Assets list " +
    "(PM WOs often cover many tags that way). Use for questions like 'how many times was HT-P-7010B maintained " +
    "this year?', 'when was the last PM of HT-P-4415C?', 'is there any open WO on HT-V-2010?'. " +
    "Use search_work_orders to list WOs, get_work_order for one WO. Cancelled WOs are never counted. " +
    "The tag must be exact (e.g. HT-P-7010B, not HT-P-7010); use search_locations first if unsure. " +
    "Highlight the tag's `critical` label (SCE / PCE) when present.",
  inputSchema: {
    tag: z.string().describe("Exact equipment tag (location), e.g. 'HT-P-7010B'"),
    tagScope: tagScopeSchema,
    worktype: z.enum(WO_WORKTYPE).optional().describe("Only count this work type, e.g. PM or CM"),
    reportedAfter: z.string().optional().describe("ISO date: only WOs reported on or after this date, e.g. '2026-01-01'"),
    reportedBefore: z.string().optional().describe("ISO date: only WOs reported before this date, e.g. '2027-01-01'"),
  },
  errorLabel: "Error summarizing work orders by tag",
  run: (args) => maximoClient.summarizeWorkOrdersByTag(args),
});
