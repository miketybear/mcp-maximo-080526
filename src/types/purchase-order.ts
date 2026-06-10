import { z } from "zod";
import { PO_STATUS, PO_TYPE } from "../constants.js";

// ─────────────────────────────────────────────────
// Search input schema
// ─────────────────────────────────────────────────

/**
 * Zod shape for the search_purchase_orders tool input.
 * Status MUST NOT include CAN.
 */
export const SearchPurchaseOrdersInputSchema = {
  vendor: z.string().optional().describe("Vendor (company) code, e.g. 3311V029"),
  formno: z.string().optional().describe("Form number of the purchase order, e.g. BD-OPS-2024-085"),
  description: z.string().optional().describe("Partial text to match against PO description"),
  status: z.enum(PO_STATUS).optional().describe("PO status — MUST NOT be CAN. Valid values: WAPPR, APPR, INPRG, WREVCC, WTECHMGR, CLOSE"),
  techpic: z.string().optional().describe("Technical Person In Charge, e.g. CUONGLV"),
  potype: z.enum(PO_TYPE).optional().describe("Purchase Order type, e.g. STD (standard) or REL (release)"),
  fromDate: z.string().optional().describe("Start date for PO order date filtering (YYYY-MM-DD), inclusive"),
  toDate: z.string().optional().describe("End date for PO order date filtering (YYYY-MM-DD), inclusive"),
  limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of records to return"),
  pageno: z.number().int().min(1).optional().describe("Page number to retrieve (default 1). Use responseInfo.totalPages from a previous response to know how many pages exist."),
} as const;

export type SearchPurchaseOrdersInput = z.infer<z.ZodObject<typeof SearchPurchaseOrdersInputSchema>>;

// ─────────────────────────────────────────────────
// Search by budget input schema
// ─────────────────────────────────────────────────

/**
 * Zod shape for the search_purchase_orders_by_budget tool input.
 */
export const SearchPurchaseOrdersByBudgetInputSchema = {
  budgetcode: z.string().describe("The budget code of the PO line items (supports wildcard/partial match, e.g. BD1-O3203-2026-01 or BD1-O3203-2026 or O3203)"),
  fromDate: z.string().optional().describe("Start date for PO order date filtering (YYYY-MM-DD), inclusive"),
  toDate: z.string().optional().describe("End date for PO order date filtering (YYYY-MM-DD), inclusive"),
  limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of records to return"),
  pageno: z.number().int().min(1).optional().describe("Page number to retrieve (default 1). Use responseInfo.totalPages from a previous response to know how many pages exist."),
} as const;

export type SearchPurchaseOrdersByBudgetInput = z.infer<z.ZodObject<typeof SearchPurchaseOrdersByBudgetInputSchema>>;


// ─────────────────────────────────────────────────
// PO Line item schema
// ─────────────────────────────────────────────────

/** Zod schema for a single PO line (poline). */
export const POLineSchema = z.object({
  polinenum: z.number().optional(),
  itemnum: z.string().optional(),
  description: z.string().optional(),
  orderqty: z.number().optional(),
  unitcost: z.number().optional(),
  linecost: z.number().optional(),
  storeloc: z.string().optional(),
  receivedqty: z.number().optional(),
  budgetcode: z.string().optional(),
  linetype: z.string().optional(),
}).loose();

export type POLine = z.infer<typeof POLineSchema>;

// ─────────────────────────────────────────────────
// PO Budget Summary schema
// ─────────────────────────────────────────────────

/** Zod schema for a custom PO budget summary (xbgvposummary). */
export const XbgvpoSummarySchema = z.object({
  budgetcode: z.string().optional(),
  description: z.string().optional(),
}).loose();

export type XbgvpoSummary = z.infer<typeof XbgvpoSummarySchema>;

// ─────────────────────────────────────────────────
// Purchase Order domain schema
// ─────────────────────────────────────────────────

/** Zod schema for a single Maximo Purchase Order record. */
export const PurchaseOrderSchema = z.object({
  ponum: z.string(),
  revisionnum: z.number().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  vendor: z.string().optional(),
  companies: z.array(
    z.object({
      name: z.string().optional(),
    }).loose()
  ).optional(),
  formno: z.string().optional(),
  potype: z.string().optional(),
  techpic: z.string().optional(),
  orderdate: z.string().optional(),
  currencycode: z.string().optional(),
  totalcost: z.number().optional().describe("Total Cost of PO (in PO currency)"),
  totalbasecost: z.number().optional().describe("Total Cost of PO (in base USD currency)"),
  siteid: z.string().optional(),
  vendeliverydate: z.string().optional(),
  poline: z.array(POLineSchema).optional(),
  xbgvposummary: z.array(XbgvpoSummarySchema).optional(),
}).loose();

export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

/** Standard Maximo OSLC collection envelope for Purchase Orders. */
/** Reusable schema for a paging link object (previousPage / nextPage). */
const PagingLinkSchema = z.object({ href: z.string() }).loose();

export const PurchaseOrderCollectionSchema = z.object({
  member: z.array(PurchaseOrderSchema),
  responseInfo: z.object({
    href: z.string(),
    totalCount: z.number().optional(),
    totalPages: z.number().optional(),
    pagenum: z.number().optional(),
    previousPage: PagingLinkSchema.optional(),
    nextPage: PagingLinkSchema.optional(),
  }).loose().optional(),
}).loose();

export type PurchaseOrderCollection = z.infer<typeof PurchaseOrderCollectionSchema>;
