import { maximoClient } from "../maximo-client.js";
import { GetLocationChildrenInputSchema } from "../types/index.js";
import { defineTool } from "./define-tool.js";

/** Walk down the location hierarchy from a given tag. */
export const getLocationChildren = defineTool({
  name: "get_location_children",
  description:
    "Get the child locations (sub-equipment) below a Maximo location tag, as a tree. " +
    "Use it to browse the hierarchy top-down or answer 'what is under X / what does X consist of'. " +
    "The PRIMARY hierarchy starts at site BD1, whose children are PQP (Process Platform & Living Quarter), " +
    "HT1 (Hai Thach 1 Wellhead Platform), MT1 (Moc Tinh 1 Wellhead Platform) and PL-BD (Subsea Pipeline System). " +
    "Each node has hasChildren; drill down by calling again on a child with hasChildren=true. " +
    "depth 2–3 returns grandchildren in one call — use only for small sub-trees (one pump or skid). " +
    "childrenTruncated=true means more children exist than limit; raise limit or use search_locations with parent. " +
    "Response: `tree` is a ready-to-display text tree (├── / └──) with 🔴 SCE <group> / 🟡 PCE markers — show it verbatim in a code block when the user wants a tree; `root` holds the same data as JSON. " +
    "Requires the exact tag; use search_locations first if unsure.",
  inputSchema: GetLocationChildrenInputSchema,
  errorLabel: "Error getting location children",
  run: (args) => maximoClient.getLocationChildren(args),
});
