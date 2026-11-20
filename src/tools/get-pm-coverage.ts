import { z } from "zod";
import { WO_WORKTYPE } from "../constants.js";
import { maximoClient } from "../maximo-client.js";
import { GetLocationChildrenInputSchema } from "../types/index.js";
import { defineTool } from "./define-tool.js";

export const getPmCoverage = defineTool({
  name: "get_pm_coverage",
  description:
    "PM coverage check for a location sub-tree: lists every equipment tag under a location (system, skid, area) " +
    "and whether it had any Work Order of the given worktype (default PM) reported in the period. " +
    "A tag counts as covered when a WO names it in its own location OR in its Multi Assets list " +
    "(route PMs reach their stops through one of these: child WOs or Multi Assets rows); lastWo.matchedBy says which. " +
    "Each tag also lists the `routes` it is a stop of, with " +
    "lastRouteWo (latest route WO regardless of period) — use it to explain long-interval routes (e.g. 2-yearly PSV checks). " +
    "Use for 'which equipment under HT-AHW had no PM this year?', 'are all SCE tags of X maintained?'. " +
    "Result: summary (tagCount, coveredCount, notCoveredCount, notCoveredSce, notCoveredPce), notCovered " +
    "(overdue first, then noPlan, then notDue; SCE before PCE within each) and covered (woCount, openCount, lastWo per tag). " +
    "Each tag also has pmPlans: the ACTIVE PMs of that worktype whose location is the tag or whose route has it as a stop " +
    "(frequency, frequnit, lastcompdate, nextdate, nextForecast from PM forecast). A tag with no WO gets planStatus: " +
    "'overdue' (a plan's due date has passed — real gap), 'noPlan' (no PM covers the tag — check whether it needs one) or " +
    "'notDue' (planned, next date still ahead, e.g. a 24-month PSV route — not a gap). " +
    "summary has notCoveredOverdue / notCoveredNoPlan / notCoveredNotDue. " +
    "Always present overdue and noPlan first, then notDue, and highlight SCE 🔴 / PCE 🟡 using each tag's `critical` label. " +
    "Large sub-trees (whole platform) are refused — lower depth, choose a sub-system, or set onlyCritical=true. " +
    "Use get_location_children / search_locations first to find the right parent tag. Cancelled WOs are ignored.",
  inputSchema: {
    location: z.string().describe("Exact parent location tag whose sub-tree is checked, e.g. 'HT-AHW'"),
    systemid: GetLocationChildrenInputSchema.systemid,
    depth: z.number().int().min(1).max(3).default(2).describe("How many levels below location to include (1–3, default 2)"),
    worktype: z.enum(WO_WORKTYPE).default("PM").describe("Work type that counts as coverage (default PM)"),
    reportedAfter: z.string().describe("ISO date, start of the period (WO reportdate on or after), e.g. '2026-01-01'"),
    reportedBefore: z.string().optional().describe("ISO date, end of the period (exclusive), e.g. '2027-01-01'. Omit for 'until now'."),
    onlyCritical: z.boolean().optional().describe("true = check only SCE / PCE tags"),
  },
  errorLabel: "Error checking PM coverage",
  run: (args) => maximoClient.getPmCoverage(args),
});
