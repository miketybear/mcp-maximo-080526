import { z } from "zod";

// ─────────────────────────────────────────────────
// Input schemas
// ─────────────────────────────────────────────────

/**
 * Input schema for the get_exchange_rate tool.
 * Fetches the current active exchange rate between two currencies from Maximo.
 * Searches both direct and inverse pairs automatically.
 */
export const GetExchangeRateInputSchema = {
  currencycode: z
    .string()
    .describe("The source currency code (e.g. 'VND', 'EUR', 'SGD')."),
  currencycodeto: z
    .string()
    .optional()
    .default("USD")
    .describe("The target currency code (default: 'USD')."),
} as const;

export type GetExchangeRateInput = z.infer<z.ZodObject<typeof GetExchangeRateInputSchema>>;

/**
 * Input schema for the convert_to_usd tool.
 * Converts a monetary amount from the given currency to USD using the active Maximo exchange rate.
 */
export const ConvertToUsdInputSchema = {
  amount: z
    .number()
    .positive()
    .describe("The monetary amount to convert to USD."),
  currencycode: z
    .string()
    .describe("The source currency code (e.g. 'VND', 'EUR', 'SGD')."),
} as const;

export type ConvertToUsdInput = z.infer<z.ZodObject<typeof ConvertToUsdInputSchema>>;

// ─────────────────────────────────────────────────
// Domain schema
// ─────────────────────────────────────────────────

/** Zod schema for a single Maximo Exchange Rate record from mxl-excgrates. */
export const ExchangeRateSchema = z.object({
  /** The source currency code as stored in Maximo (e.g. 'USD', 'EUR', 'VND'). */
  currencycode: z.string(),
  /** The target currency code as stored in Maximo. */
  currencycodeto: z.string(),
  /** The date the rate becomes effective (ISO date string). */
  activedate: z.string().optional(),
  /** The date the rate expires (ISO date string). */
  expiredate: z.string().optional(),
  /** The exchange rate value as stored in Maximo. May be direct or inverse depending on how the user entered it. */
  exchangerate: z.number(),
}).loose();

export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;

export const ExchangeRateCollectionSchema = z.object({
  member: z.array(ExchangeRateSchema),
  responseInfo: z
    .object({
      href: z.string(),
      totalCount: z.number().optional(),
      totalPages: z.number().optional(),
      pagenum: z.number().optional(),
    })
    .loose()
    .optional(),
}).loose();

export type ExchangeRateCollection = z.infer<typeof ExchangeRateCollectionSchema>;

// ─────────────────────────────────────────────────
// Normalized lookup result
// ─────────────────────────────────────────────────

/**
 * Normalized result returned by the exchange rate lookup.
 * The normalizedRate always expresses: 1 unit of `currencycode` = N units of `currencycodeto`.
 * If Maximo stored the pair inversely, the raw rate has already been inverted.
 */
export interface ExchangeRateLookupResult {
  /** Source currency as requested (e.g. 'VND'). */
  currencycode: string;
  /** Target currency as requested (e.g. 'USD'). */
  currencycodeto: string;
  /**
   * Normalized rate: 1 unit of currencycode = normalizedRate units of currencycodeto.
   * E.g. for VND→USD this will be ~0.00004 even if Maximo stored 25000 (USD→VND).
   */
  normalizedRate: number;
  /** True if the record was found stored as the inverse pair in Maximo. */
  isInverse: boolean;
  /** The raw exchange rate value as stored in Maximo. */
  rawRate: number;
  /** The raw currencycode as stored in Maximo (may differ from requested if inverse). */
  rawCurrencyCode: string;
  /** The raw currencycodeto as stored in Maximo. */
  rawCurrencyCodeTo: string;
  /** Active-from date of the rate record (ISO date string). */
  activedate?: string;
  /** Expiry date of the rate record (ISO date string). */
  expiredate?: string;
}
