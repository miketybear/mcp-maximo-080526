import { maximoClient } from "../maximo-client.js";
import { ListLocationSystemsInputSchema } from "../types/index.js";
import { defineTool } from "./define-tool.js";

/** List location systems, or the systems one tag belongs to. */
export const listLocationSystems = defineTool({
  name: "list_location_systems",
  description:
    "List Maximo location systems. PRIMARY is the main physical hierarchy; the others are functional systems " +
    "(e.g. HT-44-COOLINGMEDIUM Cooling Medium System, HT-80-FIRE-WATER Firewater System, HT-40-FUEL-GAS Fuel Gas System). " +
    "Without arguments returns all systems; query filters by description (partial match). " +
    "With location, returns only the systems that tag belongs to and its parent in each. " +
    "Use the returned systemid with get_location_children / get_location_ancestors / search_locations " +
    "to browse a functional system (e.g. 'list equipment in the fuel gas system').",
  inputSchema: ListLocationSystemsInputSchema,
  errorLabel: "Error listing location systems",
  run: (args) => maximoClient.listLocationSystems(args),
});
