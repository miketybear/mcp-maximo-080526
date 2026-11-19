import { maximoClient } from "../maximo-client.js";
import { ListActionsByInvestigationInputSchema } from "../types/index.js";
import { CRITICAL_HINT } from "./critical-hint.js";
import { defineTool } from "./define-tool.js";

/** All actions raised from one investigation, with progress counts. */
export const listActionsByInvestigation = defineTool({
  name: "list_actions_by_investigation",
  description:
    "List all Action Tracking (Oil) items raised from one investigation (linked through Maximo related records), with progress. " +
    "Input: investigation ticket ID (e.g. P131837) or report number (INV-/RCA-/TR-...). " +
    "Returns investigation (title, status, location...), summary { total, open, overdue, byStatus } and actions[] " +
    "(each with status, pic, deadline, overdue, actionSummary, rootCause, subCause), sorted by deadline. " +
    "Use for 'what actions came out of investigation X', 'is investigation X fully closed out', 'which root causes were addressed'. " +
    "When presenting, group actions by rootCause if there are several. " +
    CRITICAL_HINT +
    "If you only know the equipment or event, find the ticket ID first with search_investigations.",
  inputSchema: ListActionsByInvestigationInputSchema,
  errorLabel: (args) => `Error listing actions of investigation ${args.investigationId}`,
  run: (args) => maximoClient.listActionsByInvestigation(args),
});
