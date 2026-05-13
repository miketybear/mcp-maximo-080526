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
 * Date filtering: the LLM resolves natural-language dates (e.g. "next week")
 * into ISO-8601 strings and passes them as schedStartAfter / schedStartBefore.
 * The client builds the oslc.where clause from these.
 */
export const SearchWorkOrdersInputSchema = {
  wonum: z.string().optional().describe("Work Order number (exact match)"),
  description: z.string().optional().describe("Partial match on the description of work order or failure in description."),
  status: z.enum(WO_STATUS).optional().describe("Work Order status"),
  siteid: z.string().optional().describe("Site ID (e.g., BD1)"),
  bdpocdiscipline: z.enum(WO_DISCIPLINE).optional().describe("Discipline code/team for the work order, e.g. mechanical, electrical, rotating, etc."),
  worktype: z.enum(WO_WORKTYPE).optional().describe("Work type of the work order, PM is planned maintenance and CM is corrective maintenance"),
  wopriority: z.enum(WO_PRIORITY).optional().describe("Work Order priority, with 4 being the highest priority, e.g. 1=Low, 2=Medium, 3=High, 4=Urgent"),
  schedFinishAfter: z.string().optional().describe("Return WOs with schedfinish on or after this ISO-8601 date (e.g. 2026-05-01T00:00:00+07:00). Use this together with schedFinishBefore to filter by a date range."),
  schedFinishBefore: z.string().optional().describe("Return WOs with schedfinish strictly before this ISO-8601 date (e.g. 2026-06-01T00:00:00+07:00). Use this together with schedFinishAfter to filter by a date range."),
  plusgsafetycrit: z.boolean().optional().describe("Safety Critical Element (SCE) flag (true/false), true if user search for SCE WO"),
  plusgcomcrit: z.boolean().optional().describe("Production Critical Element (PCE) flag (true/false), true if user search for PCE WO"),
  limit: z.number().int().min(1).max(100).default(10).describe("Maximum number of records to return"),
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

/** Zod schema for a single Maximo Work Order record (the fields we select). */
export const WorkOrderSchema = z.object({
  wonum: z.string(),
  description: z.string().optional(),
  description_longdescription: z.string().optional(),
  status: z.string().optional(),
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
}).loose();

export type WorkOrder = z.infer<typeof WorkOrderSchema>;

/** Standard Maximo OSLC collection envelope. */
export const WorkOrderCollectionSchema = z.object({
  member: z.array(WorkOrderSchema),
  responseInfo: z.object({
    href: z.string(),
    totalCount: z.number().optional(),
    totalPages: z.number().optional(),
    pagenum: z.number().optional(),
  }).loose().optional(),
}).loose();

export type WorkOrderCollection = z.infer<typeof WorkOrderCollectionSchema>;
