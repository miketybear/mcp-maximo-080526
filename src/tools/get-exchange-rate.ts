import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";
import { GetExchangeRateInputSchema } from "../types/index.js";

/**
 * Tool Behavior Rules:
 *
 * - Accepts a source currency code (e.g. VND, EUR, SGD) and an optional target
 *   currency code (defaults to USD).
 * - Searches Maximo mxl-excgrates for an active rate where:
 *     activedate <= today AND expiredate >= today
 * - Tries the direct pair (FROM → TO) first, then automatically falls back to
 *   the inverse pair (TO → FROM) if no direct record exists.
 * - Returns the raw Maximo record alongside a normalizedRate that always means:
 *     1 unit of FROM currency = normalizedRate units of TO currency
 * - If isInverse is true, the rawRate stored in Maximo is inverted to derive normalizedRate.
 */
export function register(server: McpServer) {
  server.registerTool(
    "get_exchange_rate",
    {
      description:
        "Use this tool when the user asks about an exchange rate, currency rate, or wants to know the rate value between two currencies — WITHOUT needing to convert a specific monetary amount. " +
        "Examples: 'What is the USD to VND rate this month?', 'Show me the EUR/USD exchange rate', 'What rate does Maximo have for SGD?'. " +
        "Do NOT use this tool when there is a specific amount to convert — use convert_to_usd instead. " +
        "Accepts currencycode (source, e.g. 'VND', 'EUR', 'SGD') and optional currencycodeto (target, default 'USD'). " +
        "Automatically searches both the direct pair (e.g. EUR→USD) and the inverse pair (e.g. USD→VND) in Maximo (mxl-excgrates). " +
        "Returns the raw Maximo record plus a normalizedRate where 1 unit of source = normalizedRate units of target. " +
        "Only considers rates active as of today (activedate ≤ today AND expiredate ≥ today).",
      inputSchema: GetExchangeRateInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const { currencycode, currencycodeto = "USD" } = args;
        const result = await maximoClient.getExchangeRate(currencycode, currencycodeto);

        if (!result) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    found: false,
                    message:
                      `No active exchange rate found for ${currencycode.toUpperCase()} ↔ ${currencycodeto.toUpperCase()} as of today. ` +
                      `Checked both direct and inverse pairs in Maximo (mxl-excgrates).`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ found: true, ...result }, null, 2) }],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error fetching exchange rate: ${e.message}` }],
        };
      }
    }
  );
}
