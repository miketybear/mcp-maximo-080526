import { z } from "zod";
import { ACT_STATUS, INV_STATUS } from "../constants.js";

// ─────────────────────────────────────────────────
// Notes on the BIENDONG Action Tracking (Oil) / Investigations (Oil) data
// ─────────────────────────────────────────────────
// Action Tracking = object structure REP_PLUSGACT (WORKORDER rows with
// woclass ACTTRACK, key wonum). Most current data lives in custom hse_*
// fields: hse_acttrack_num (ACT-yyyy-mm-dd-<wonum>), hse_act_pic,
// hse_act_tl, hse_act_deadline, hse_root_causes, hse_sub_cause ...
// Investigations = REP_PLUSGINV (TICKET rows, class INVESTIGATION, key
// ticketid). Each action points back to its investigation through the
// RELATEDRECORD table (relatedrecclass INVESTIGATION, relatetype ORIGINATOR),
// readable with `rel.relatedrecord{...}` and filterable with
// `relatedrecord.relatedreckey="..."`.

const pagenoField = z.number().int().min(1).optional().describe(
  "Page number to retrieve (default 1). Use responseInfo.totalPages from a previous response to know how many pages exist.",
);
const dateField = (what: string) => z.string().optional().describe(`${what} (ISO date, e.g. 2025-01-01)`);

// ─────────────────────────────────────────────────
// Action Tracking inputs
// ─────────────────────────────────────────────────

/** Filters shared by search_action_tracking and summarize_action_tracking. */
const ActionFilterShape = {
  query: z.string().optional().describe(
    "Full-text search (whole words) in the action description, action summary, further action and root cause, e.g. 'crimp', 'job plan', 'ESD'.",
  ),
  status: z.array(z.enum(ACT_STATUS)).optional().describe(
    "Action statuses: WAPPR (waiting approval), INPROGRESS (PIC in progress), ACTTLRET (returned by team lead), " +
    "ACTWCLOSE (agreed, waiting close-out), CLOSE (closed). Cancelled actions are never returned.",
  ),
  openOnly: z.boolean().optional().describe("true → only actions not yet CLOSE (WAPPR, INPROGRESS, ACTTLRET, ACTWCLOSE). Use for 'outstanding / open actions'."),
  overdue: z.boolean().optional().describe("true → open actions whose deadline (hse_act_deadline) is already past. Implies openOnly."),
  dueWithinDays: z.number().int().min(1).max(365).optional().describe("Open actions whose deadline falls within the next N days (not yet overdue). Implies openOnly."),
  pic: z.string().optional().describe("Person/group in charge (hse_act_pic), exact Maximo code, e.g. DONGPD, ENISUP, FIELDPRODSUP, OIM. Use the code, not the full name."),
  teamLead: z.string().optional().describe("Team lead (hse_act_tl), exact Maximo user code, e.g. TRUNGTN, DUONGVQ."),
  discipline: z.enum(["MECH", "E&I", "PROD", "RES"]).optional().describe("Discipline: MECH, E&I, PROD (production), RES (rotating equipment)."),
  incidentGroup: z.enum(["PSR", "M&R", "IMS", "OTHER"]).optional().describe("Incident group of the originating investigation (hse_plusgincidentgroup)."),
  severity: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().describe("Incident type / severity of the originating investigation (hse_plusginctype)."),
  location: z.string().optional().describe("Equipment tag, partial match, e.g. HT-ESD-9501 or ESD-95."),
  investigationId: z.string().optional().describe("Ticket ID of the originating investigation, e.g. P131837 (use list_actions_by_investigation for a full view of one investigation)."),
  relatedWonum: z.string().optional().describe("Work order number linked to the action as a related record, e.g. H13980990."),
  reportedAfter: dateField("Only actions reported on/after this date"),
  reportedBefore: dateField("Only actions reported before this date"),
} as const;

export const SearchActionTrackingInputSchema = {
  ...ActionFilterShape,
  limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of actions to return"),
  pageno: pagenoField,
} as const;
export type SearchActionTrackingInput = z.infer<z.ZodObject<typeof SearchActionTrackingInputSchema>>;

export const ACT_GROUP_KEYS = ["status", "pic", "teamLead", "discipline", "incidentGroup", "severity", "location", "subCause"] as const;

export const SummarizeActionTrackingInputSchema = {
  groupBy: z.array(z.enum(ACT_GROUP_KEYS)).min(1).max(3).describe(
    "Columns to count by (computed by Maximo in one request), e.g. ['pic'] with openOnly=true → open actions per PIC; " +
    "['status'] → status breakdown; ['discipline','status'] → status per discipline; ['subCause'] → most frequent root-cause categories.",
  ),
  ...ActionFilterShape,
} as const;
export type SummarizeActionTrackingInput = z.infer<z.ZodObject<typeof SummarizeActionTrackingInputSchema>>;
export type ActionFilter = Omit<SearchActionTrackingInput, "limit" | "pageno">;

export const GetActionTrackingInputSchema = {
  id: z.string().describe("Action number: the wonum (e.g. H14323957) or the ACT number (e.g. ACT-2026-09-09-H14323957)."),
} as const;
export type GetActionTrackingInput = z.infer<z.ZodObject<typeof GetActionTrackingInputSchema>>;

export const ListActionsByInvestigationInputSchema = {
  investigationId: z.string().describe(
    "Investigation ticket ID (e.g. P131837) or its report number (INV-2026-08-27-P131837 / RCA-... / TR-...).",
  ),
  includeClosed: z.boolean().default(true).describe("Include CLOSE actions. Default true; set false to list only outstanding actions."),
} as const;
export type ListActionsByInvestigationInput = z.infer<z.ZodObject<typeof ListActionsByInvestigationInputSchema>>;

// ─────────────────────────────────────────────────
// Investigation inputs
// ─────────────────────────────────────────────────

export const INV_GROUP_KEYS = ["status", "discipline", "incidentGroup", "severity", "investLead", "facility", "location", "failureCode", "problemCode"] as const;

export const SearchInvestigationsInputSchema = {
  query: z.string().optional().describe("Full-text search (whole words) in the investigation title, finding and consequence, e.g. 'ESD', 'seal leak'."),
  status: z.array(z.enum(INV_STATUS)).optional().describe(
    "Investigation statuses: NEW, WRTL (final review/approval of technical report), WCLOSED (waiting closed), CLOSED. Cancelled investigations are never returned.",
  ),
  openOnly: z.boolean().optional().describe("true → only investigations not yet CLOSED."),
  location: z.string().optional().describe("Equipment tag, partial match, e.g. HT-PM-4110A."),
  discipline: z.enum(["MECH", "E&I", "PROD", "RES"]).optional().describe("Discipline: MECH, E&I, PROD, RES."),
  incidentGroup: z.enum(["PSR", "M&R", "IMS", "OTHER"]).optional().describe("Incident group (plusgincidentgroup)."),
  severity: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().describe("Incident type / severity (plusginctype)."),
  investLead: z.string().optional().describe("Investigation lead (plusginvestlead), exact Maximo user code, e.g. KIETHT."),
  facility: z.enum(["PQP-HT", "WHP-HT1", "WHP-MT1"]).optional().describe("Facility (hse_facility)."),
  shutdownType: z.enum(["ESD", "PSD", "USD"]).optional().describe("Only investigations of a shutdown event: ESD, PSD or USD (unit trip)."),
  reportedAfter: dateField("Only investigations reported on/after this date"),
  reportedBefore: dateField("Only investigations reported before this date"),
  groupBy: z.array(z.enum(INV_GROUP_KEYS)).min(1).max(3).optional().describe(
    "Return counts per group instead of a list, e.g. ['failureCode'] for the most frequent failure codes, ['severity','status'] for a breakdown. " +
    "With groupBy the response is { totalCount, groups[{..., count}] } sorted by count.",
  ),
  limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of investigations to return"),
  pageno: pagenoField,
} as const;
export type SearchInvestigationsInput = z.infer<z.ZodObject<typeof SearchInvestigationsInputSchema>>;

export const GetInvestigationInputSchema = {
  id: z.string().describe("Investigation ticket ID (e.g. P131837) or report number (INV-..., RCA-... or TR-...)."),
} as const;
export type GetInvestigationInput = z.infer<z.ZodObject<typeof GetInvestigationInputSchema>>;

// ─────────────────────────────────────────────────
// Response schemas (loose: only the fields the tools rely on are typed)
// ─────────────────────────────────────────────────

const ResponseInfoSchema = z.object({
  totalCount: z.number().optional(),
  totalPages: z.number().optional(),
  pagenum: z.number().optional(),
}).loose().optional();

export const RelatedRecordSchema = z.object({
  relatedreckey: z.string().optional(),
  relatedrecclass: z.string().optional(),
  relatetype: z.string().optional(),
  relatedrecwonum: z.string().optional(),
}).loose();
export type RelatedRecord = z.infer<typeof RelatedRecordSchema>;

/** Generic Maximo row; values are mapped field by field in maximo-client. */
const RowSchema = z.object({ relatedrecord: z.array(RelatedRecordSchema).optional() }).catchall(z.unknown());
export type MaximoRow = z.infer<typeof RowSchema>;

export const RowCollectionSchema = z.object({
  member: z.array(RowSchema),
  responseInfo: ResponseInfoSchema,
}).loose();
export type RowCollection = z.infer<typeof RowCollectionSchema>;
