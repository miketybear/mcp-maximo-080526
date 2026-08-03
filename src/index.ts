import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { config } from "./config.js";
import { registerAllTools } from "./tools/index.js";
import { buildAuthMiddleware } from "./auth.js";

const server = new McpServer(
  { name: "maximo-mcp-server", version: "0.1.0" },
  {
    instructions:
      "Use the provided tools to interact with the Maximo REST API. " +
      "The server supports multiple objects: Work Orders, Purchase Orders, and Vendors. " +
      "1. For Work Orders (WOs): Prefer searching using search_work_orders to find the exact wonum " +
      "before calling get_work_order. Always summarize data from the description_longdescription " +
      "field before presenting/outputting it to the user. " +
      "2. For Purchase Orders (POs): Prefer searching using search_purchase_orders to find the exact " +
      "ponum before calling get_purchase_order. " +
      "3. For Vendors/Companies: If searching for POs by a vendor or company name, always search " +
      "for the vendor code using search_vendor first, then use search_purchase_orders with the vendor code.",
  },
);

registerAllTools(server);

// ---------------------------------------------------------------------------
// Transport selection: HTTP (default) or stdio
// ---------------------------------------------------------------------------

if (config.transport === "stdio") {
  // stdio mode — for local MCP clients (Claude Desktop, Cursor, Gemini CLI, etc.)
  // Auth is handled by the host OS; no Express server needed.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[transport] MCP Server running on stdio");
} else {
  // HTTP mode — Streamable HTTP transport (stateless mode)
  const authMiddleware = buildAuthMiddleware();
  const app = express();
  app.use(express.json());

  // -----------------------------------------------------------------------
  // RFC 9728 & RFC 8414 — OAuth Protected Resource & Authorization Server Metadata
  // Enables MCP clients (e.g. Claude Desktop, Cursor) to auto-discover the
  // authorization server for this MCP server via OAuth 2.1 flow.
  // -----------------------------------------------------------------------
  if (config.authProvider === "entra-id" && config.serverBaseUrl) {
    const tenantId = config.azure.tenantId;

    // RFC 9728 Protected Resource Metadata
    app.get("/.well-known/oauth-protected-resource", (_req, res) => {
      res.json({
        resource: config.azure.audience,
        authorization_servers: [config.serverBaseUrl],
        bearer_methods_supported: ["header"],
        scopes_supported: [`api://${config.azure.clientId}/mcp.access`],
      });
    });

    // RFC 8414 Authorization Server Metadata (proxies Entra ID metadata)
    app.get("/.well-known/oauth-authorization-server", (_req, res) => {
      res.json({
        issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
        authorization_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
        token_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        jwks_uri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
        scopes_supported: [`api://${config.azure.clientId}/mcp.access`, "openid", "profile", "offline_access"],
      });
    });

    // Fallback: Redirect /authorize requests to Entra ID
    app.get("/authorize", (req, res) => {
      const queryParams = new URLSearchParams(req.query as Record<string, string>);
      // Entra ID v2.0 requires a 'scope' parameter. If the MCP client omitted it,
      // default to our server's primary scope + standard OIDC scopes.
      if (!queryParams.has("scope")) {
        queryParams.set(
          "scope",
          `api://${config.azure.clientId}/mcp.access offline_access openid profile`
        );
      }
      const entraAuthUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${queryParams.toString()}`;
      res.redirect(302, entraAuthUrl);
    });

    // Fallback: Proxy /token requests to Entra ID
    app.post("/token", async (req, res) => {
      try {
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
        const bodyParams = new URLSearchParams(req.body);
        if (!bodyParams.has("scope")) {
          bodyParams.set(
            "scope",
            `api://${config.azure.clientId}/mcp.access offline_access openid profile`
          );
        }
        const response = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: bodyParams.toString(),
        });
        const data = await response.json();
        res.status(response.status).json(data);
      } catch (err) {
        console.error("[auth] Token proxy error:", err);
        res.status(500).json({ error: "server_error", error_description: "Failed to proxy token request." });
      }
    });

    console.log("[auth] RFC 9728 & RFC 8414 OAuth Metadata & Fallback endpoints enabled.");
  }

  const mcpHandler: express.RequestHandler = async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, 
    });
    
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };

  app.all(["/mcp", "/"], authMiddleware, mcpHandler);

  // Health check endpoint for host verification
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.listen(config.port, () => {
    console.log(`MCP Server running on http://localhost:${config.port}/mcp`);
    console.log(`Health check available at http://localhost:${config.port}/health`);
  });
}
