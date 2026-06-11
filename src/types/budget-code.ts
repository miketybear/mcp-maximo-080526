import { z } from "zod";

// ─────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────

/**
 * Zod shape for the get_budget_code tool input.
 *
 * budgetcode supports both exact and partial matching:
 *   - Exact:   pass the full code, e.g. "OPS-2024-001"
 *   - Partial: pass a substring, e.g. "OPS-2024"
 */
export const GetBudgetCodeInputSchema = {
  budgetcode: z
    .string()
    .describe(
      "Budget code to search for. Supports exact or partial match (case-insensitive), e.g. 'OPS-2024' or 'OPS-2024-001'."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum number of records to return (1–50, default 10)."),
  pageno: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Page number to retrieve (default 1). Use responseInfo.totalPages from a previous response to know how many pages exist."
    ),
} as const;

export type GetBudgetCodeInput = z.infer<z.ZodObject<typeof GetBudgetCodeInputSchema>>;

// ─────────────────────────────────────────────────
// Domain schema
// ─────────────────────────────────────────────────

/** Zod schema for a single Maximo Budget Code record from oslcmxbudget. */
export const BudgetCodeSchema = z.object({
  /** The budget code identifier. */
  budgetcode: z.string(),
  /** Parent budget code (hierarchical relationship). */
  parentcode: z.string().optional(),
  /** The fiscal/budget year this record applies to. */
  budgetyear: z.coerce.number().optional(),
  /** Lifecycle status of the budget code (e.g. ACTIVE, INACTIVE). */
  status: z.string().optional(),
  /** Department code that owns this budget. */
  deptcode: z.string().optional(),
  /** Person responsible for managing this budget (budget custodian). */
  custodian: z.string().optional(),
  /** Total approved budget amount for this code. */
  approvedamt: z.number().optional(),
  /** Amount already utilized / committed against this budget. */
  utilizedamt: z.number().optional(),
  /** Remaining amount that can still be submitted/committed. */
  sbmtremain: z.number().optional(),
}).loose();

export type BudgetCode = z.infer<typeof BudgetCodeSchema>;

// ─────────────────────────────────────────────────
// Collection schema (OSLC envelope)
// ─────────────────────────────────────────────────

const PagingLinkSchema = z.object({ href: z.string() }).loose();

export const BudgetCodeCollectionSchema = z.object({
  member: z.array(BudgetCodeSchema),
  responseInfo: z
    .object({
      href: z.string(),
      totalCount: z.number().optional(),
      totalPages: z.number().optional(),
      pagenum: z.number().optional(),
      previousPage: PagingLinkSchema.optional(),
      nextPage: PagingLinkSchema.optional(),
    })
    .loose()
    .optional(),
}).loose();

export type BudgetCodeCollection = z.infer<typeof BudgetCodeCollectionSchema>;
