import { maximoClient } from "../maximo-client.js";
import { GetInvestigationInputSchema } from "../types/index.js";
import { CRITICAL_HINT } from "./critical-hint.js";
import { defineTool } from "./define-tool.js";

/** Full detail of one investigation, with related records and action progress. */
export const getInvestigation = defineTool({
  name: "get_investigation",
  description:
    "Get full detail of one Investigation (Oil) by ticket ID (e.g. P131837) or report number (INV-/RCA-/TR-...). " +
    "Returns the list fields plus consequence (what happened), finding, leftAsFound, rcaConducted, rcaRecommendation, failureMechanism, failureSubdivision, " +
    "problem/cause/remedy codes, detectionMethod, barrierFailed, hardwareFailureMode, repeatFailureType, shutdownDuration, productionLoss, " +
    "productionImpactCostUsd, failed item, lesson-learned info, " +
    "actionSummary { total, open, closed } and relatedRecords (follow-up ACTTRACK actions, related WORKORDERs, originating incident) each with a short summary. " +
    "For the full list of actions with root causes use list_actions_by_investigation. " +
    CRITICAL_HINT +
    "Summarize long text fields instead of pasting them verbatim.",
  inputSchema: GetInvestigationInputSchema,
  errorLabel: (args) => `Error fetching investigation ${args.id}`,
  run: (args) => maximoClient.getInvestigation(args),
});
