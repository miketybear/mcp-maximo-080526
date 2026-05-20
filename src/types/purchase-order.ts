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
  limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of records to return"),
} as const;

export type SearchPurchaseOrdersInput = z.infer<z.ZodObject<typeof SearchPurchaseOrdersInputSchema>>;

// ─────────────────────────────────────────────────
// PO Line item schema
// ─────────────────────────────────────────────────

/** Zod schema for a single PO line (poline). */
export const POLineSchema = z.object({
  polinenum: z.number().optional(),
  itemnum: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unitcost: z.number().optional(),
  linecost: z.number().optional(),
  storeloc: z.string().optional(),
  receivedqty: z.number().optional(),
}).loose();

export type POLine = z.infer<typeof POLineSchema>;

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
  currency: z.string().optional(),
  totalcost: z.number().optional(),
  siteid: z.string().optional(),
  poline: z.array(POLineSchema).optional(),
}).loose();

export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

/** Standard Maximo OSLC collection envelope for Purchase Orders. */
export const PurchaseOrderCollectionSchema = z.object({
  member: z.array(PurchaseOrderSchema),
  responseInfo: z.object({
    href: z.string(),
    totalCount: z.number().optional(),
    totalPages: z.number().optional(),
    pagenum: z.number().optional(),
  }).loose().optional(),
}).loose();

export type PurchaseOrderCollection = z.infer<typeof PurchaseOrderCollectionSchema>;
