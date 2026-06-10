import { z } from "zod";

// ─────────────────────────────────────────────────
// Search input schema
// ─────────────────────────────────────────────────

/**
 * Zod shape for the search_vendor tool input.
 */
export const SearchVendorInputSchema = {
  name: z.string().describe("Partial company/vendor name to match (case-insensitive), e.g. Viet Dan"),
  limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of records to return"),
  pageno: z.number().int().min(1).optional().describe("Page number to retrieve (default 1). Use responseInfo.totalPages from a previous response to know how many pages exist."),
} as const;

export type SearchVendorInput = z.infer<z.ZodObject<typeof SearchVendorInputSchema>>;

// ─────────────────────────────────────────────────
// Vendor domain schema
// ─────────────────────────────────────────────────

/** Zod schema for a single Maximo Vendor/Company record. */
export const VendorSchema = z.object({
  company: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  orgid: z.string().optional(),
}).loose();

export type Vendor = z.infer<typeof VendorSchema>;

/** Standard Maximo OSLC collection envelope for Vendors. */
/** Reusable schema for a paging link object (previousPage / nextPage). */
const PagingLinkSchema = z.object({ href: z.string() }).loose();

export const VendorCollectionSchema = z.object({
  member: z.array(VendorSchema),
  responseInfo: z.object({
    href: z.string(),
    totalCount: z.number().optional(),
    totalPages: z.number().optional(),
    pagenum: z.number().optional(),
    previousPage: PagingLinkSchema.optional(),
    nextPage: PagingLinkSchema.optional(),
  }).loose().optional(),
}).loose();

export type VendorCollection = z.infer<typeof VendorCollectionSchema>;
