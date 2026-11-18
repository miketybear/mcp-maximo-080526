import { maximoClient } from "../maximo-client.js";
import { GetExchangeRateInputSchema } from "../types/index.js";
import { defineTool } from "./define-tool.js";

/**
 * Tool Behavior Rules:
 *
 * - Searches mxl-excgrates for a rate active on asOfDate (default today).
 * - Tries the direct pair (FROM → TO) first, then the inverse pair (TO → FROM).
 * - normalizedRate always means: 1 unit of FROM = normalizedRate units of TO.
 */
export const getExchangeRate = defineTool({
  name: "get_exchange_rate",
  description:
    "Use this tool when the user asks about an exchange rate, currency rate, or wants to know the rate value between two currencies — WITHOUT needing to convert a specific monetary amount. " +
    "Examples: 'What is the USD to VND rate this month?', 'Show me the EUR/USD exchange rate', 'What rate does Maximo have for SGD?', 'What was the VND rate in October 2025?'. " +
    "Do NOT use this tool when there is a specific amount to convert — use convert_to_usd instead. " +
    "Accepts currencycode (source, e.g. 'VND', 'EUR', 'SGD'), optional currencycodeto (target, default 'USD'), " +
    "and optional asOfDate (YYYY-MM-DD) to query the rate active on a specific past or future date (defaults to today). " +
    "Automatically searches both the direct pair (e.g. EUR→USD) and the inverse pair (e.g. USD→VND) in Maximo (mxl-excgrates). " +
    "Returns the raw Maximo record plus a normalizedRate where 1 unit of source = normalizedRate units of target.",
  inputSchema: GetExchangeRateInputSchema,
  errorLabel: "Error fetching exchange rate",
  async run({ currencycode, currencycodeto = "USD", asOfDate }) {
    const result = await maximoClient.getExchangeRate(currencycode, currencycodeto, asOfDate);
    if (!result) {
      return {
        found: false,
        message:
          `No active exchange rate found for ${currencycode.toUpperCase()} ↔ ${currencycodeto.toUpperCase()}` +
          (asOfDate ? ` as of ${asOfDate}` : " as of today") +
          `. Checked both direct and inverse pairs in Maximo (mxl-excgrates).`,
      };
    }
    return { found: true, ...result };
  },
});
