import { maximoClient } from "../maximo-client.js";
import { SummarizeActionTrackingInputSchema } from "../types/index.js";
import { defineTool } from "./define-tool.js";

/** Counts of Action Tracking items per group (server-side group-by). */
export const summarizeActionTracking = defineTool({
  name: "summarize_action_tracking",
  description:
    "Count Action Tracking (Oil) items grouped by status, pic, teamLead, discipline, incidentGroup, severity, location or subCause (root-cause category), " +
    "computed by Maximo in one request. Accepts the same filters as search_action_tracking (openOnly, overdue, dueWithinDays, pic, discipline, dates...). " +
    "Use for 'how many', 'breakdown', 'who has the most open/overdue actions', 'most frequent root-cause categories'. " +
    "Examples: groupBy ['pic'] + overdue=true → overdue actions per PIC; groupBy ['discipline','status'] → status per discipline. " +
    "Response: { groupBy, totalCount, groupCount, groups[{<keys>, count}] } sorted by count (largest first); \"(blank)\" = no value; status groups carry statusDescription — show it instead of the bare code. " +
    "Then call search_action_tracking with the matching filter to list a group.",
  inputSchema: SummarizeActionTrackingInputSchema,
  errorLabel: "Error summarizing action tracking",
  run: (args) => maximoClient.summarizeActionTracking(args),
});
