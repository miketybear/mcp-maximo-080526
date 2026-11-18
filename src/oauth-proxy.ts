import express from "express";
import { config } from "./config.js";
import { handleRegistration, lookupClient } from "./dcr.js";

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

/**
 * Mount the OAuth discovery + Entra ID proxy endpoints (RFC 9728, RFC 8414,
 * RFC 7591) used when AUTH_PROVIDER=entra-id.
 */
export function mountOAuthProxy(app: express.Express): void {
  const { tenantId, proxyClientId, proxyClientSecret, apiScope, defaultScope } = config.azure;
  const baseUrl = config.serverBaseUrl;
  const entraBase = `https://login.microsoftonline.com/${tenantId}`;

  // Answer CORS preflight (OPTIONS) for every OAuth endpoint. Without this,
  // Express auto-replies to OPTIONS on POST-only routes and skips the CORS
  // middleware, so browsers block the follow-up request.
  app.options(
    [/^\/.well-known\/oauth-(protected-resource|authorization-server)(\/.*)?$/, "/register", "/token"],
    oauthCorsMiddleware,
  );

  // RFC 9728 Protected Resource Metadata
  //
  // Per RFC 9728 §3.1, path-aware clients derive the well-known URL from the
  // resource path — since this server's resource lives at /mcp (not root),
  // Anthropic's cloud infrastructure requests
  // /.well-known/oauth-protected-resource/mcp (with the /mcp suffix) as the
  // very first discovery call. A regex route handles both the bare path and
  // any suffix variant, same as the AS metadata route below.
  app.get(/^\/.well-known\/oauth-protected-resource(\/.*)?$/, oauthCorsMiddleware, (_req, res) => {
    res.json({
      resource: config.azure.audience,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
      scopes_supported: [apiScope],
    });
  });

  // RFC 8414 Authorization Server Metadata (proxies Entra ID metadata)
  //
  // Per RFC 8414 §3.1, path-aware clients request
  // /.well-known/oauth-authorization-server/mcp (with the /mcp suffix).
  app.get(/^\/.well-known\/oauth-authorization-server(\/.*)?$/, oauthCorsMiddleware, (_req, res) => {
    res.json({
      // Per RFC 8414 Section 3, issuer MUST match the authorization server URL
      // advertised in /.well-known/oauth-protected-resource (config.serverBaseUrl)
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      // Advertise the DCR endpoint so MCP clients can self-register (RFC 7591)
      registration_endpoint: `${baseUrl}/register`,
      jwks_uri: `${entraBase}/discovery/v2.0/keys`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
      scopes_supported: [apiScope, "openid", "profile", "offline_access"],
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

  // Proxy: redirect /authorize to Entra ID, swapping the DCR-issued client_id
  // for the real Entra ID proxy client_id so Entra ID recognises the client app.
  app.get("/authorize", (req, res) => {
    const queryParams = new URLSearchParams(req.query as Record<string, string>);

    // Some MCP clients (e.g. Claude Desktop's
    // "Advanced settings" static Client ID/Secret entry) are configured with the
    // real Entra ID proxy client_id directly and never call POST /register. Only
    // reject the request when a client_id was supplied that is neither a known
    // DCR registration nor the real proxy client_id.
    const suppliedClientId = queryParams.get("client_id");
    if (suppliedClientId && suppliedClientId !== proxyClientId && !lookupClient(suppliedClientId)) {
      res.status(400).json({
        error: "invalid_client",
        error_description: `Unknown client_id "${suppliedClientId}". Please re-register via POST /register.`,
      });
      return;
    }
    queryParams.set("client_id", proxyClientId);

    // Entra ID v2.0 requires a 'scope' parameter.
    if (!queryParams.has("scope")) queryParams.set("scope", defaultScope);

    res.redirect(302, `${entraBase}/oauth2/v2.0/authorize?${queryParams.toString()}`);
  });

  // Proxy: forward /token to Entra ID with the real proxy client credentials,
  // since the MCP client only knows its DCR-issued client_id.
  app.post("/token", oauthCorsMiddleware, async (req, res) => {
    try {
      const bodyParams = new URLSearchParams(req.body as Record<string, string>);

      // Entra ID must see the real proxy client credentials, not the DCR ones.
      bodyParams.set("client_id", proxyClientId);
      bodyParams.set("client_secret", proxyClientSecret);
      if (!bodyParams.has("scope")) bodyParams.set("scope", defaultScope);

      console.log("[auth] Proxying token request to Entra ID with params:", Array.from(bodyParams.keys()));

      // Intentionally do NOT forward the client's own Authorization header
      // (e.g. HTTP Basic auth carrying the DCR client_id/secret) — Entra ID
      // would see conflicting credentials.
      const response = await fetch(`${entraBase}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
