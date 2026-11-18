import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { toNodeHandler } from "@modelcontextprotocol/node";
import express from "express";
import { config } from "./config.js";
import { registerAllTools, tools } from "./tools/index.js";
import { buildAuthMiddleware } from "./auth.js";
import { mountOAuthProxy } from "./oauth-proxy.js";

const INSTRUCTIONS =
  "Use the provided tools to interact with the Maximo REST API. " +
  "The server supports multiple objects: Work Orders, Purchase Orders, and Vendors. " +
  "1. For Work Orders (WOs): Prefer searching using search_work_orders to find the exact wonum " +
  "before calling get_work_order. Always summarize data from the description_longdescription " +
  "field before presenting/outputting it to the user. " +
  "2. For Purchase Orders (POs): Prefer searching using search_purchase_orders to find the exact " +
  "ponum before calling get_purchase_order. " +
  "3. For Vendors/Companies: If searching for POs by a vendor or company name, always search " +
  "for the vendor code using search_vendor first, then use search_purchase_orders with the vendor code. " +
  "4. For Locations (equipment tags): ALWAYS highlight Safety Critical Elements (SCE) and Production Critical Elements (PCE) " +
  "whenever a location is shown. Colour code: 🔴 red = SCE, 🟡 yellow = PCE. Tags with a `critical` field are SCE and/or PCE: " +
  "write the tag in bold followed by the `critical` label exactly as returned " +
  "(e.g. **HT-PSV-7001** 🔴 SCE (BD-PC007 Relief Systems), **HT-P-4415C** 🟡 PCE); in tables put the label in its own column. " +
  "Use only these emoji for colour — do not use HTML <span>/<font>, LaTeX \color or other colour markup, which most chat clients " +
  "strip or show as raw text. When listing several tags state how many are SCE / PCE. " +
  "When the user asks for a tree / hierarchy / structure, display the `tree` field returned by get_location_children or " +
  "get_location_ancestors verbatim inside a code block (do not reformat it), followed by its legend.";

/**
 * The tool list and server info only change on redeploy, so 2026-07-28 clients
 * may cache them. `private`: responses sit behind per-user auth.
 * (2025-era responses are never affected by cache hints.)
 */
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Factory for a fresh MCP server with all tools registered. The SDK calls it
 * per HTTP request (stateless) and once per stdio connection.
 */
function createServer(): McpServer {
  const server = new McpServer(
    { name: "maximo-mcp-server", version: "0.2.0" },
    {
      instructions: INSTRUCTIONS,
      cacheHints: {
        "tools/list": { ttlMs: ONE_HOUR_MS, cacheScope: "private" },
        "server/discover": { ttlMs: ONE_HOUR_MS, cacheScope: "private" },
      },
    },
  );
  registerAllTools(server);
  return server;
}

const logError = (scope: string) => (error: Error) => console.error(`[${scope}]`, error);

console.error(`[registry] ${tools.length} tool(s): ${tools.map((t) => t.name).join(", ")}`);

if (config.transport === "stdio") {
  // stdio mode — for local MCP clients (Claude Desktop, Cursor, Gemini CLI, etc.)
  // Auth is handled by the host OS; no Express server needed. serveStdio
  // serves both 2025-era (initialize) and 2026-07-28 openings.
  serveStdio(createServer, { onerror: logError("stdio") });
  console.error("[transport] MCP Server running on stdio");
} else {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (config.authProvider === "entra-id" && config.serverBaseUrl) {
    mountOAuthProxy(app);
  }

  // Streamable HTTP. createMcpHandler serves 2026-07-28 requests natively and,
  // with the default `legacy: 'stateless'`, answers 2025-era clients (Claude,
  // ChatGPT today) with a fresh server per request. GET/DELETE get 405.
  const mcp = toNodeHandler(createMcpHandler(createServer, { onerror: logError("mcp") }), {
    onerror: logError("mcp-adapter"),
  });
  // Pass the body express.json() already consumed as parsedBody.
  const mcpHandler: express.RequestHandler = (req, res) => mcp(req, res, req.body);

  app.all(["/mcp", "/"], buildAuthMiddleware(), mcpHandler);

  // Health check endpoint for host verification
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.listen(config.port, () => {
    console.log(`MCP Server running on http://localhost:${config.port}/mcp`);
    console.log(`Health check available at http://localhost:${config.port}/health`);
  });
}
