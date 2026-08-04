import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { config } from "./config.js";
import { registerAllTools } from "./tools/index.js";
import { buildAuthMiddleware } from "./auth.js";
import { handleRegistration, lookupClient } from "./dcr.js";

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
  app.use(express.urlencoded({ extended: true }));

  // ---------------------------------------------------------------------------
  // CORS middleware for OAuth / DCR endpoints
  // MCP clients like Claude Desktop call /register, /token, and /.well-known/*
  // cross-origin from https://claude.ai. Without CORS headers the browser blocks
  // the response and the client reports "Couldn't register".
  // ---------------------------------------------------------------------------
  const oauthCorsMiddleware: express.RequestHandler = (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Max-Age", "86400");
      res.status(204).end();
      return;
    }
    next();
  };


  // -----------------------------------------------------------------------
  // RFC 9728 & RFC 8414 — OAuth Protected Resource & Authorization Server Metadata
  // Enables MCP clients (e.g. Claude Desktop, Cursor) to auto-discover the
  // authorization server for this MCP server via OAuth 2.1 flow.
  // -----------------------------------------------------------------------
  if (config.authProvider === "entra-id" && config.serverBaseUrl) {
    const tenantId = config.azure.tenantId;

    // RFC 9728 Protected Resource Metadata
    app.get("/.well-known/oauth-protected-resource", oauthCorsMiddleware, (_req, res) => {
      res.json({
        resource: config.azure.audience,
        authorization_servers: [config.serverBaseUrl],
        bearer_methods_supported: ["header"],
        scopes_supported: [`api://${config.azure.clientId}/mcp.access`],
      });
    });

    // RFC 8414 Authorization Server Metadata (proxies Entra ID metadata)
    //
    // Per RFC 8414 §3.1, path-aware clients derive the well-known URL from the
    // resource path. For a resource at /mcp, Anthropic's cloud infrastructure
    // requests /.well-known/oauth-authorization-server/mcp (with the /mcp suffix).
    // Using a regex route handles both the bare path and any suffix variant.
    app.get(/^\/.well-known\/oauth-authorization-server(\/.*)?$/, oauthCorsMiddleware, (_req, res) => {
      res.json({
        // Per RFC 8414 Section 3, issuer MUST match the authorization server URL
        // advertised in /.well-known/oauth-protected-resource (config.serverBaseUrl)
        issuer: config.serverBaseUrl,
        authorization_endpoint: `${config.serverBaseUrl}/authorize`,
        token_endpoint: `${config.serverBaseUrl}/token`,
        // Advertise the DCR endpoint so MCP clients can self-register (RFC 7591)
        registration_endpoint: `${config.serverBaseUrl}/register`,
        jwks_uri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
        scopes_supported: [`api://${config.azure.clientId}/mcp.access`, "openid", "profile", "offline_access"],
      });
    });

    // RFC 7591 — Dynamic Client Registration endpoint
    // MCP clients POST here to self-register and obtain a client_id without
    // any manual configuration. The server issues a DCR client_id and internally
    // maps all OAuth flows through the pre-configured Entra ID proxy client.
    app.post("/register", oauthCorsMiddleware, (req, res) => {
      const { status, body } = handleRegistration(req.body);
      res.status(status).json(body);
    });

    // Fallback/Proxy: Redirect /authorize requests to Entra ID
    // Swap the DCR-issued client_id for the real Entra ID proxy client_id so
    // Entra ID recognises the client app.
    app.get("/authorize", (req, res) => {
      const queryParams = new URLSearchParams(req.query as Record<string, string>);

      // Validate DCR client_id if provided — reject unknown clients early
      const dcrClientId = queryParams.get("client_id");
      if (dcrClientId) {
        const registered = lookupClient(dcrClientId);
        if (!registered) {
          res.status(400).json({
            error: "invalid_client",
            error_description: `Unknown client_id "${dcrClientId}". Please re-register via POST /register.`,
          });
          return;
        }
        // Replace DCR client_id with the real Entra ID proxy client_id
        queryParams.set("client_id", config.azure.proxyClientId);
      } else {
        // No client_id provided — inject the proxy client_id directly
        queryParams.set("client_id", config.azure.proxyClientId);
      }

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

    // Fallback/Proxy: Proxy /token requests to Entra ID
    // Injects proxy client credentials so Entra ID accepts the request even
    // when the MCP client only knows its DCR-issued client_id (not the real one).
    app.post("/token", oauthCorsMiddleware, async (req, res) => {
      try {
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
        const bodyParams = new URLSearchParams(req.body as Record<string, string>);

        // Remove any DCR-issued client_id / client_secret from the body — Entra ID
        // must see the real proxy client credentials, not the ephemeral DCR ones.
        bodyParams.delete("client_id");
        bodyParams.delete("client_secret");

        // Inject the real proxy client credentials
        bodyParams.set("client_id", config.azure.proxyClientId);
        bodyParams.set("client_secret", config.azure.proxyClientSecret);

        if (!bodyParams.has("scope")) {
          bodyParams.set(
            "scope",
            `api://${config.azure.clientId}/mcp.access offline_access openid profile`
          );
        }

        console.log("[auth] Proxying token request to Entra ID with params:", Array.from(bodyParams.keys()));

        const fetchHeaders: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
        if (req.headers.authorization) {
          fetchHeaders["Authorization"] = req.headers.authorization;
        }

        const response = await fetch(tokenUrl, {
          method: "POST",
          headers: fetchHeaders,
          body: bodyParams.toString(),
        });
        const data = await response.json();

        if (!response.ok) {
          console.error("[auth] Entra ID token error:", response.status, data);
        } else {
          console.log("[auth] Entra ID token exchange successful!");
        }

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
