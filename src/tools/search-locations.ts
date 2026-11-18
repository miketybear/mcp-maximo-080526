import { maximoClient } from "../maximo-client.js";
import { SearchLocationsInputSchema } from "../types/index.js";
import { defineTool } from "./define-tool.js";

/** Find equipment tags (locations) by code, description or equipment type. */
export const searchLocations = defineTool({
  name: "search_locations",
  description:
    "Search Maximo locations (equipment tags) by tag code, description, equipment type/function, " +
    "Safety Critical Element (SCE) / Production Critical Element (PCE) flags or SCE group. " +
    "Use sce=true / pce=true to answer 'list SCE / PCE equipment' questions, optionally with sceGroup or description. " +
    "Use this when the user names a piece of equipment in words (e.g. 'cooling medium pump C', 'oxygen scavenger pump') " +
    "or only part of a tag number, to find the exact tag before calling get_location_children, get_location_ancestors, " +
    "search_work_orders or analyze_work_orders_history_by_tag. " +
    "Each result has location (tag), description, parent, status, locType (Pump, Motor, Valves, Transmitter...), locFunction, " +
    "pidNumber (P&ID drawing), sce, sceGroup + sceGroupDescription (e.g. BD-SD001 Emergency Shutdown System), pce " +
    "and hasChildren (parent/hasChildren refer to systemid, default PRIMARY). Decommissioned tags are hidden unless includeDecommissioned=true. " +
    "Tags with a `critical` field are SCE and/or PCE — always highlight them when presenting results: bold tag + the `critical` label as returned (🔴 SCE, 🟡 PCE). " +
    "For large result sets (responseInfo.totalCount above ~100) do NOT page through everything: tell the user the total and call again with groupBy " +
    "(e.g. ['locType']) to show a breakdown, then list the group the user picks. With groupBy the response is { totalCount, groups[{..., count}] } sorted by count. " +
    "Pagination: responseInfo has totalCount, totalPages and pagenum; call again with the same filters and pageno to get another page.",
  inputSchema: SearchLocationsInputSchema,
  errorLabel: "Error searching locations",
  run: (args) => maximoClient.searchLocations(args),
});
