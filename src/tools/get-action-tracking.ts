import { maximoClient } from "../maximo-client.js";
import { GetActionTrackingInputSchema } from "../types/index.js";
import { CRITICAL_HINT } from "./critical-hint.js";
import { defineTool } from "./define-tool.js";

/** Full detail of one Action Tracking item, with its related records. */
export const getActionTracking = defineTool({
  name: "get_action_tracking",
  description:
    "Get full detail of one Action Tracking (Oil) item by wonum (e.g. H14323957) or action number (ACT-2026-09-09-H14323957). " +
    "Returns the list fields plus actionSummary (what was done), furtherAction, rootCause, subCause (root-cause category), assetnum, failureCode, " +
    "reportedBy, startDate, priority, longDescription, and relatedRecords: every linked record with class (INVESTIGATION / WORKORDER / ACTTRACK), " +
    "relation (ORIGINATOR = the investigation that raised this action, RELATED, FOLLOWUP) and a short summary of that record " +
    "(investigation title/status/location, work order description/status/worktype). " +
    "Use get_investigation for the full investigation, get_work_order for a related work order. " +
    CRITICAL_HINT +
    "Summarize long text fields instead of pasting them verbatim.",
  inputSchema: GetActionTrackingInputSchema,
  errorLabel: (args) => `Error fetching action ${args.id}`,
  run: (args) => maximoClient.getActionTracking(args),
});
