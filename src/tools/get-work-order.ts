import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maximoClient } from "../maximo-client.js";

/**
 * Registers the get_work_order tool on the MCP server.
 * The SDK infers handler arg types directly from inputSchema.
 */
export function register(server: McpServer) {
  server.registerTool("get_work_order", {
    description: "Fetch detailed information for a specific Maximo Work Order by its wonum.",
    inputSchema: {
      wonum: z.string().describe("The exact Work Order number"),
      includeLabor: z.boolean().optional().describe("Set to true to include labor or craft details"),
      includeMaterial: z.boolean().optional().describe("Set to true to include materials or spare parts details"),
      includeTasks: z.boolean().optional().describe("Set to true to include Work order Tasks details"),
    },
    annotations: { readOnlyHint: true },
  }, async ({ wonum, includeLabor, includeMaterial, includeTasks }) => {
    try {
      const results = await maximoClient.getWorkOrder(wonum, includeLabor, includeMaterial, includeTasks);

      // Since oslc.where returns a collection (even for 1 item), we can pull out the member if it exists
      const member = results.member?.[0] ?? results;

      return {
        content: [{ type: "text" as const, text: JSON.stringify(member, null, 2) }],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Error fetching work order: ${e.message}` }],
      };
    }
  });
}
