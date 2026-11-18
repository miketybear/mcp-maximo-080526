import { maximoClient } from "../maximo-client.js";
import { GetLocationAncestorsInputSchema } from "../types/index.js";
import { defineTool } from "./define-tool.js";

/** Walk up the location hierarchy from a tag to the site root. */
export const getLocationAncestors = defineTool({
  name: "get_location_ancestors",
  description:
    "Get the full path of a Maximo location tag up to the site root, ordered root → ... → the tag " +
    "(e.g. BD1 → PQP → ... → HT-P-4415C → HT-PM-4415C). " +
    "Use it to answer 'which platform / package / equipment does this tag belong to' or to show where a tag sits. " +
    "Response: `tree` is a ready-to-display text path with [SCE <group>] / [PCE] markers — show it verbatim in a code block; `path` holds the same data as JSON. " +
    "Requires the exact tag; use search_locations first if unsure. " +
    "Pass systemid to get the path within a functional system instead of the PRIMARY hierarchy.",
  inputSchema: GetLocationAncestorsInputSchema,
  errorLabel: "Error getting location ancestors",
  run: (args) => maximoClient.getLocationAncestors(args),
});
