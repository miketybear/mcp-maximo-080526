import { maximoClient } from "../maximo-client.js";
import { SearchActionTrackingInputSchema } from "../types/index.js";
import { CRITICAL_HINT } from "./critical-hint.js";
import { defineTool } from "./define-tool.js";

/** Find Action Tracking (Oil) items — follow-up actions raised from investigations / RCAs. */
export const searchActionTracking = defineTool({
  name: "search_action_tracking",
  description:
    "Search Maximo Action Tracking (Oil) items: corrective / preventive follow-up actions raised from investigations and RCAs " +
    "(e.g. 'replace crimp connectors', 'create 5-year ESD loop job plan'). Each action has a PIC (person/group in charge), team lead and deadline. " +
    "Use it for questions like 'open actions of DONGPD', 'overdue actions', 'actions due this month', 'actions on HT-ESD-9501', " +
    "'actions about ESD', 'actions linked to work order H13980990'. " +
    "For counts / breakdowns ('how many open actions per PIC') use summarize_action_tracking instead; " +
    "for every action of one investigation use list_actions_by_investigation; for full detail of one action (root cause, related records) use get_action_tracking. " +
    "Each result has wonum, actionNumber (ACT-yyyy-mm-dd-wonum), description, status, pic, teamLead, deadline, overdue (true when past deadline and not closed), " +
    "location, discipline, incidentGroup, severity, investigationId (originating investigation ticket), reportDate, completedDate. " +
    "Open = status WAPPR / INPROGRESS / ACTTLRET / ACTWCLOSE; CLOSE = done. Cancelled actions are never returned. " +
    CRITICAL_HINT +
    "Pagination: responseInfo has totalCount, totalPages and pagenum; call again with the same filters and pageno for another page.",
  inputSchema: SearchActionTrackingInputSchema,
  errorLabel: "Error searching action tracking",
  run: (args) => maximoClient.searchActionTracking(args),
});
