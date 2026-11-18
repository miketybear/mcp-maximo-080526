import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
  "for the vendor code using search_vendor first, then use search_purchase_orders with the vendor code.";

/**
 * Build a fresh MCP server with all tools registered.
 * In stateless HTTP mode a new server is created per request so concurrent
 * requests never share (and overwrite) a single server↔transport connection.
 */
function createServer(): McpServer {
  const server = new McpServer({ name: "maximo-mcp-server", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  registerAllTools(server);
  return server;
}

console.error(`[registry] ${tools.length} tool(s): ${tools.map((t) => t.name).join(", ")}`);

if (config.transport === "stdio") {
  // stdio mode — for local MCP clients (Claude Desktop, Cursor, Gemini CLI, etc.)
  // Auth is handled by the host OS; no Express server needed.
  await createServer().connect(new StdioServerTransport());
  console.error("[transport] MCP Server running on stdio");
} else {
  // HTTP mode — Streamable HTTP transport (stateless mode)
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (config.authProvider === "entra-id" && config.serverBaseUrl) {
    mountOAuthProxy(app);
  }

  const mcpHandler: express.RequestHandler = async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };

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
