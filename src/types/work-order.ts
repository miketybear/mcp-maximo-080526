import { z } from "zod";
import { WO_STATUS, WO_DISCIPLINE, WO_WORKTYPE, WO_PRIORITY } from "../constants.js";

// ─────────────────────────────────────────────────
// Search input schema (shared between tool and client)
// ─────────────────────────────────────────────────

/**
 * Zod shape for the search_work_orders tool input.
 * This is the single source of truth — the tool's inputSchema AND
 * the maximoClient.searchWorkOrders() params both derive from this.
 *
 * Filter behaviour summary:
 *   - location       → fuzzy CONTAINS match on the equipment tag number field
 *   - description    → fuzzy CONTAINS match on the short WO description text
 *   - status         → exact match; CAN (cancelled) is excluded from the enum — never use it
 *   - siteid         → exact match on site identifier
 *   - bdpocdiscipline → exact match on discipline/team code
 *   - worktype       → exact match on work type code
 *   - wopriority     → exact match on numeric priority string ("1"–"4")
 *   - schedFinish*   → date-range filter on scheduled completion date
 *   - plusgsafetycrit / plusgcomcrit → boolean flags for SCE / PCE
 *   - woclass        → exact match; default is WORKORDER (excludes sub-tasks)
 *
 * Date handling: resolve any natural-language date expression (e.g. "this month",
 * "next week") to ISO-8601 before passing it as schedFinishAfter / schedFinishBefore.
 */

export const SearchWorkOrdersInputSchema = {
  location: z.string().optional().describe(
    "Equipment tag number (partial match). Filters WOs whose location field CONTAINS this value. " +
    "Example: 'HT-PM-4415C'. Use this when the user mentions a specific asset, tag, or equipment ID."
  ),
  description: z.string().optional().describe(
    "Keyword to search in the WO short description (partial/fuzzy match). " +
    "Example: 'pump seal replacement'. Use this when the user mentions a job description or subject keyword."
  ),
  status: z.enum(WO_STATUS).optional().describe(
    "Work Order status code (exact match). Valid values: " +
    "WAPPR = Waiting for Approval (created, not yet approved), " +
    "APPR = Approved (ready to be scheduled/executed), " +
    "INPRG = In Progress (work has started), " +
    "SCHED = Scheduled (approved and assigned a schedule slot), " +
    "WMATL = Waiting for Materials (approved but blocked on parts/materials), " +
    "CHKCOMP = Check Completion (pending final inspection before closing), " +
    "COMP = Completed (work finished, awaiting close), " +
    "CLOSE = Closed (fully processed and closed). " +
    "CAN (Cancelled) is never a valid filter — it is always excluded automatically. " +
    "Do NOT use this field for backlog/open/not-completed queries — use notCompleted=true instead."
  ),
  siteid: z.string().optional().describe(
    "Site identifier (exact match). Restricts results to a single site. Example: 'BD1'."
  ),
  bdpocdiscipline: z.enum(WO_DISCIPLINE).optional().describe(
    "Responsible discipline / maintenance team (exact match). Valid values: " +
    "MECH = Mechanical team, " +
    "'E&I' = Electrical & Instrumentation team, " +
    "PROD = Production / Operations team, " +
    "RES = Rotating Equipment & Reliability team. " +
    "Map user keywords: 'electrical' or 'instrumentation' → 'E&I'; 'mechanical' → MECH; " +
    "'rotating' or 'reliability' → RES; 'production' or 'operations' → PROD."
  ),
  worktype: z.enum(WO_WORKTYPE).optional().describe(
    "Work type code (exact match). Valid values: " +
    "PM = Preventive (Planned) Maintenance — scheduled, recurring tasks; " +
    "CM = Corrective Maintenance — reactive repairs triggered by a failure or defect; " +
    "General = Ad-hoc work not classified as PM or CM; " +
    "PdM = Predictive Maintenance — condition-based inspection or monitoring; " +
    "Routine = Routine operational checks or housekeeping. " +
    "Map user language: 'preventive' or 'planned' → PM; 'corrective' or 'breakdown' → CM; " +
    "'predictive' or 'condition-based' → PdM."
  ),
  wopriority: z.enum(WO_PRIORITY).optional().describe(
    "Work Order priority level (exact match on the string code). Valid values: " +
    "'1' = Low priority, " +
    "'2' = Medium priority, " +
    "'3' = High priority, " +
    "'4' = Urgent (highest priority). " +
    "Map user language: 'urgent' or 'critical' → '4'; 'high' → '3'; 'medium' or 'normal' → '2'; 'low' → '1'."
  ),
  schedFinishAfter: z.string().optional().describe(
    "ISO-8601 datetime: return WOs whose scheduled finish date is ON OR AFTER this value. " +
    "Example: '2026-05-01T00:00:00+07:00'. " +
    "Always pair with schedFinishBefore when the user requests a date range (e.g. 'this month', 'next week'). " +
    "Resolve natural-language dates to ISO-8601 before passing."
  ),
  schedFinishBefore: z.string().optional().describe(
    "ISO-8601 datetime: return WOs whose scheduled finish date is STRICTLY BEFORE this value. " +
    "Example: '2026-06-01T00:00:00+07:00'. " +
    "Always pair with schedFinishAfter when the user requests a date range."
  ),
  plusgsafetycrit: z.boolean().optional().describe(
    "Safety Critical Element (SCE) flag. Set to true to return only SCE-tagged work orders. " +
    "Use when the user asks for 'SCE', 'safety critical', or 'safety-critical element' WOs."
  ),
  plusgcomcrit: z.boolean().optional().describe(
    "Production Critical Element (PCE) flag. Set to true to return only PCE-tagged work orders. " +
    "Use when the user asks for 'PCE', 'production critical', or 'production-critical element' WOs."
  ),
  woclass: z.string().optional().describe(
    "Work Order class (exact match). Defaults to 'WORKORDER' which returns standard work orders only " +
    "and excludes sub-tasks / activity records. " +
    "Set to 'ACTIVITY' only if the user explicitly asks for tasks or sub-activities."
  ),
  parent: z.string().optional().describe(
    "Filter by parent work order relationship. " +
    "Use 'null' to return only top-level (parent) work orders whose parent field is empty/null — i.e. WOs that are NOT children of another WO. " +
    "Use 'notnull' to return only child work orders that have a parent. " +
    "Use any specific WONUM string (e.g. 'WO-12345') to return children of that exact parent WO. " +
    "When grouping results by parent or when the user asks for 'parent WOs only', set this to 'null'."
  ),
  notCompleted: z.boolean().optional().describe(
    "When true, filters to only WOs that are NOT yet completed: excludes CHKCOMP, COMP, and CLOSE. " +
    "Use this for queries like 'backlog WOs', 'open WOs', 'not completed', 'outstanding WOs', or 'pending WOs'. " +
    "Mutually exclusive with the status field — do not set both."
  ),
  limit: z.number().int().min(1).max(50).default(10).describe(
    "Maximum number of records to return per page (1–50). Defaults to 10."
  ),
  pageno: z.number().int().min(1).optional().describe(
    "Page number to retrieve (1-based). Omit to get the first page. " +
    "Use responseInfo.totalPages from a previous response to know the upper bound."
  ),
} as const;

/** Inferred type for the search input params. */
export type SearchWorkOrdersInput = z.infer<z.ZodObject<typeof SearchWorkOrdersInputSchema>>;

// ─────────────────────────────────────────────────
// Work Order domain schemas
// ─────────────────────────────────────────────────

/** Zod schema for the WPLabor nested object. */
export const WPLaborSchema = z.object({
  laborcode: z.string().optional(),
  craft: z.string().optional(),
  skilllevel: z.string().optional(),
  regularhours: z.number().optional(),
  quantity: z.number().optional(),
  linecost: z.number().optional(),
}).loose();

export type WPLabor = z.infer<typeof WPLaborSchema>;

/** Zod schema for the WPMaterial nested object. */
export const WPMaterialSchema = z.object({
  itemnum: z.string().optional(),
  itemqty: z.number().optional(),
  storeloc: z.string().optional(),
  description: z.string().optional(),
  unitcost: z.number().optional(),
  linecost: z.number().optional(),
}).loose();

export type WPMaterial = z.infer<typeof WPMaterialSchema>;

/** Zod schema for the WOACTIVITY nested object (Tasks). */
export const WOActivitySchema = z.object({
  taskid: z.union([z.number(), z.string()]).optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  location: z.string().optional(),
  estdur: z.number().optional(),
}).loose();

export type WOActivity = z.infer<typeof WOActivitySchema>;

/** Zod schema for the MATUSETRANS nested object (Material usages). */
export const MatUseTransSchema = z.object({
  itemnum: z.string().optional(),
  description: z.string().optional(),
  issuetype: z.string().optional(),
  positivequantity: z.number().optional(),
}).loose();

export type MatUseTrans = z.infer<typeof MatUseTransSchema>;

/** Zod schema for a single Maximo Work Order record (the fields we select). */
export const WorkOrderSchema = z.object({
  wonum: z.string(),
  parent: z.string().optional(),
  description: z.string().optional(),
  description_longdescription: z.string().optional(),
  status: z.string().optional(),
  woclass: z.string().optional(),
  siteid: z.string().optional(),
  reportdate: z.string().optional(),
  assetnum: z.string().optional(),
  location: z.string().optional(),
  bdpocdiscipline: z.string().optional(),
  worktype: z.string().optional(),
  schedstart: z.string().optional(),
  schedfinish: z.string().optional(),
  actstart: z.string().optional(),
  actfinish: z.string().optional(),
  estdur: z.number().optional(),
  wopriority: z.number().optional(),
  plusgsafetycrit: z.union([z.number(), z.boolean()]).optional(),
  plusgcomcrit: z.union([z.number(), z.boolean()]).optional(),
  wplabor: z.array(WPLaborSchema).optional(),
  wpmaterial: z.array(WPMaterialSchema).optional(),
  woactivity: z.array(WOActivitySchema).optional(),
  matusetrans: z.array(MatUseTransSchema).optional(),
}).loose();

export type WorkOrder = z.infer<typeof WorkOrderSchema>;

/** Standard Maximo OSLC collection envelope. */
/** Reusable schema for a paging link object (previousPage / nextPage). */
const PagingLinkSchema = z.object({ href: z.string() }).loose();

export const WorkOrderCollectionSchema = z.object({
  member: z.array(WorkOrderSchema),
  responseInfo: z.object({
    href: z.string(),
    totalCount: z.number().optional(),
    totalPages: z.number().optional(),
    pagenum: z.number().optional(),
    previousPage: PagingLinkSchema.optional(),
    nextPage: PagingLinkSchema.optional(),
  }).loose().optional(),
}).loose();

export type WorkOrderCollection = z.infer<typeof WorkOrderCollectionSchema>;
