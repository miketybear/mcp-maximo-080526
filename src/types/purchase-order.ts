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
  vendor: z.string().optional().describe("Vendor (company) code (partial match). Example: '3311V029'. Use when the user asks about a specific supplier."),
  formno: z.string().optional().describe("Form / reference number of the purchase order (partial match). Example: 'BD-OPS-2024-085'."),
  description: z.string().optional().describe("Keyword to search in the PO short description (partial/fuzzy match). Example: 'pump spare parts'."),
  status: z.enum(PO_STATUS).optional().describe(
    "PO status code (exact match). Valid values: " +
    "WAPPR = Waiting for Approval, APPR = Approved, INPRG = In Progress, " +
    "WREVCC = Waiting for Revision/CC, WTECHMGR = Waiting for Tech Manager, CLOSE = Closed. " +
    "CAN (Cancelled) is always excluded automatically — never specify it."
  ),
  techpic: z.string().optional().describe("Technical Person In Charge (exact match on user code). Example: 'CUONGLV'. Use when the user asks about a specific technical PIC."),
  purchaseagent: z.string().optional().describe(
    "Procurement buyer / purchasing agent responsible for the PO (exact match on user code). " +
    "Example: 'CUONGPV'. Use when the user asks 'who is the buyer', 'list POs by buyer', or mentions a buyer's name/code. " +
    "Map the user's name to their Maximo user code before passing."
  ),
  potype: z.enum(PO_TYPE).optional().describe(
    "Purchase Order type (exact match on Maximo code). Valid values: " +
    "STD = Standard Purchase Order — a one-off, standalone purchase not tied to any blanket or frame contract " +
    "(users may call this 'one-off PO', 'one-time purchase', 'direct PO', or 'spot purchase'); " +
    "REL = Release Order — a call-off purchase drawn against an existing blanket/frame contract " +
    "(users may call this 'release', 'call-off', 'blanket release', or 'frame contract order'). " +
    "IMPORTANT: 'Release Order' here is a procurement term — it is completely unrelated to a Maintenance Work Order (WO). " +
    "If the user says 'work order' in the context of a purchase or contract, they likely mean a Release Order (REL), NOT a maintenance WO."
  ),
  fromDate: z.string().optional().describe("Start date for PO order date (orderdate) filtering (YYYY-MM-DD), inclusive. Example: '2026-01-01'."),
  toDate: z.string().optional().describe("End date for PO order date (orderdate) filtering (YYYY-MM-DD), inclusive. Example: '2026-12-31'."),
  vendeliveryAfter: z.string().optional().describe(
    "ISO-8601 date: return POs whose vendor expected delivery date (vendeliverydate) is ON OR AFTER this value. " +
    "Example: '2026-06-01'. Always pair with vendeliveryBefore when filtering by a delivery date range. " +
    "Use when the user asks 'deliver next month', 'expected delivery in June', etc."
  ),
  vendeliveryBefore: z.string().optional().describe(
    "ISO-8601 date: return POs whose vendor expected delivery date (vendeliverydate) is STRICTLY BEFORE this value. " +
    "Example: '2026-07-01'. Always pair with vendeliveryAfter when filtering by a delivery date range."
  ),
  limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of records to return per page (1–50). Defaults to 10."),
  pageno: z.number().int().min(1).optional().describe("Page number to retrieve (1-based). Omit to get the first page. Use responseInfo.totalPages from a previous response to know the upper bound."),
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
  purchaseagent: z.string().optional(),
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
