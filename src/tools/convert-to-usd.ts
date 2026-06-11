import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";
import { ConvertToUsdInputSchema } from "../types/index.js";

/**
 * Tool Behavior Rules:
 *
 * - Takes an amount and a source currency code.
 * - Internally fetches the active exchange rate from Maximo (mxl-excgrates),
 *   searching both direct and inverse pairs automatically.
 * - Applies the correct formula:
 *     Direct pair (e.g. EUR→USD stored as rate 1.08): amountUsd = amount × rate
 *     Inverse pair (e.g. USD→VND stored as rate 25000): amountUsd = amount ÷ rate
 * - Returns the converted USD amount along with the rate details used.
 * - Throws a descriptive error if no active rate is found.
 */
export function register(server: McpServer) {
  server.registerTool(
    "convert_to_usd",
    {
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
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const { amount, currencycode } = args;
        const result = await maximoClient.convertToUsd(amount, currencycode);

        const output = {
          input: {
            amount,
            currencycode: result.currencycode,
          },
          amountUsd: result.amountUsd,
          rateUsed: result.rateUsed,
          conversionNote: result.rateUsed.isInverse
            ? `Rate stored inversely in Maximo as ${result.rateUsed.rawCurrencyCode}→${result.rateUsed.rawCurrencyCodeTo} = ${result.rateUsed.rawRate}. ` +
              `Normalized to 1 ${result.currencycode} = ${result.rateUsed.normalizedRate} USD by inverting (1 ÷ ${result.rateUsed.rawRate}).`
            : `Rate stored directly in Maximo as ${result.rateUsed.rawCurrencyCode}→${result.rateUsed.rawCurrencyCodeTo} = ${result.rateUsed.rawRate}.`,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error converting to USD: ${e.message}` }],
        };
      }
    }
  );
}
