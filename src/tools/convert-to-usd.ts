import { maximoClient } from "../maximo-client.js";
import { ConvertToUsdInputSchema } from "../types/index.js";
import { defineTool } from "./define-tool.js";

/**
 * Tool Behavior Rules:
 *
 * - Fetches the active rate from mxl-excgrates (direct or inverse pair).
 *     Direct pair (e.g. EUR→USD stored as 1.08):   amountUsd = amount × rate
 *     Inverse pair (e.g. USD→VND stored as 25000): amountUsd = amount ÷ rate
 * - Throws a descriptive error if no active rate is found.
 */
export const convertToUsd = defineTool({
  name: "convert_to_usd",
  description:
    "Use this tool when a specific monetary amount in a non-USD currency needs to be expressed in USD. " +
    "Trigger this tool automatically whenever a concrete amount in a foreign currency (VND, EUR, SGD, etc.) appears in the context " +
    "and a USD equivalent is needed or implied — even if the user does not explicitly say 'convert'. " +
    "Examples: 'Total budgetary cost is 5,707,825,200 VND', 'The PO value is 50,000 EUR, what is that in USD?', 'Convert 1,200 SGD to USD'. " +
    "Do NOT use this tool just to look up an exchange rate without an amount — use get_exchange_rate instead. " +
    "Provide amount (the numeric value to convert) and currencycode (source currency, e.g. 'VND', 'EUR', 'SGD'). " +
    "Automatically fetches the active rate from Maximo (mxl-excgrates), handles both direct (EUR→USD) and inverse (USD→VND) stored pairs, " +
    "and returns amountUsd (the converted USD value) plus the rate details used for full transparency.",
  inputSchema: ConvertToUsdInputSchema,
  errorLabel: "Error converting to USD",
  async run({ amount, currencycode }) {
    const result = await maximoClient.convertToUsd(amount, currencycode);
    const rate = result.rateUsed;
    return {
      input: { amount, currencycode: result.currencycode },
      amountUsd: result.amountUsd,
      rateUsed: rate,
      conversionNote: rate.isInverse
        ? `Rate stored inversely in Maximo as ${rate.rawCurrencyCode}→${rate.rawCurrencyCodeTo} = ${rate.rawRate}. ` +
          `Normalized to 1 ${result.currencycode} = ${rate.normalizedRate} USD by inverting (1 ÷ ${rate.rawRate}).`
        : `Rate stored directly in Maximo as ${rate.rawCurrencyCode}→${rate.rawCurrencyCodeTo} = ${rate.rawRate}.`,
    };
  },
});
