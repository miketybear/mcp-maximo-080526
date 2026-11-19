import { maximoClient } from "../maximo-client.js";
import { SearchInvestigationsInputSchema } from "../types/index.js";
import { CRITICAL_HINT } from "./critical-hint.js";
import { defineTool } from "./define-tool.js";

/** Find Investigations (Oil) — incident / failure investigations and RCAs. */
export const searchInvestigations = defineTool({
  name: "search_investigations",
  description:
    "Search Maximo Investigations (Oil): incident / equipment-failure investigations and root cause analyses (RCA/RCFA) — e.g. trips, ESD/PSD events, pump failures. " +
    "Use for 'investigations on HT-PM-4110A', 'ESD events in 2025', 'open investigations of KIETHT', 'high incidents this year'. " +
    "Filters: query (title/finding/consequence words), status, openOnly, location, discipline, incidentGroup (PSR/M&R/IMS/OTHER), severity (HIGH/MEDIUM/LOW), " +
    "investLead, facility (PQP-HT/WHP-HT1/WHP-MT1), shutdownType (ESD/PSD/USD), reportedAfter/Before. " +
    "Each result has ticketid, reportNumber (INV-...), description, status, location, discipline, incidentGroup, severity, investigationLead, facility, " +
    "shutdownType, failureCode, reportDate, eventDate. Cancelled investigations are never returned. " +
    "With groupBy (e.g. ['failureCode'], ['severity','status'], ['location']) the response is { totalCount, groups[{..., count}] } sorted by count — " +
    "use it for 'how many' / 'most frequent' questions or when totalCount is large. " +
    "Then use get_investigation for detail and list_actions_by_investigation for its follow-up actions. " +
    CRITICAL_HINT +
    "Pagination: responseInfo has totalCount, totalPages and pagenum; call again with pageno.",
  inputSchema: SearchInvestigationsInputSchema,
  errorLabel: "Error searching investigations",
  run: (args) => maximoClient.searchInvestigations(args),
});
