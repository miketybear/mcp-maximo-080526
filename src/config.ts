import "dotenv/config";

const API_KEY = process.env.API_KEY;
const MAXIMO_URL = process.env.MAXIMO_URL;
const MCP_API_KEY = process.env.MCP_API_KEY;
const AUTH_PROVIDER = process.env.AUTH_PROVIDER || "static";
const TRANSPORT = process.env.TRANSPORT || "http";
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID || "";
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID || "";
// Audience defaults to the standard Entra ID app URI if not explicitly overridden
const AZURE_AUDIENCE = process.env.AZURE_AUDIENCE || `api://${AZURE_CLIENT_ID}`;
// Canonical URI of this MCP server (used in RFC 9728 Protected Resource Metadata)
const MCP_SERVER_BASE_URL = process.env.MCP_SERVER_BASE_URL || "";
// Proxy client credentials — the pre-registered Entra ID Client App used by the
// server internally to handle OAuth on behalf of dynamically registered MCP clients.
const AZURE_PROXY_CLIENT_ID = process.env.AZURE_PROXY_CLIENT_ID || "";
const AZURE_PROXY_CLIENT_SECRET = process.env.AZURE_PROXY_CLIENT_SECRET || "";
// File path where dynamically registered DCR clients (RFC 7591) are persisted so
// registrations survive server restarts/redeploys instead of living only in memory.
const DCR_STORE_PATH = process.env.DCR_STORE_PATH || "./data/dcr-clients.json";

if (!API_KEY) {
  console.warn("WARNING: API_KEY environment variable is not set.");
}
if (!MAXIMO_URL) {
  console.warn("WARNING: MAXIMO_URL environment variable is not set. API calls will fail.");
}
if (AUTH_PROVIDER === "static" && !MCP_API_KEY) {
  console.warn("WARNING: MCP_API_KEY environment variable is not set. Server is running WITHOUT authentication.");
}
if (AUTH_PROVIDER === "entra-id") {
  if (!AZURE_TENANT_ID) console.warn("WARNING: AZURE_TENANT_ID is not set. Entra ID auth will fail.");
  if (!AZURE_CLIENT_ID) console.warn("WARNING: AZURE_CLIENT_ID is not set. Entra ID auth will fail.");
  if (!MCP_SERVER_BASE_URL) console.warn("WARNING: MCP_SERVER_BASE_URL is not set. OAuth metadata discovery (RFC 9728) will be incomplete.");
  if (!AZURE_PROXY_CLIENT_ID) console.warn("WARNING: AZURE_PROXY_CLIENT_ID is not set. Dynamic Client Registration (DCR) will not work.");
  if (!AZURE_PROXY_CLIENT_SECRET) console.warn("WARNING: AZURE_PROXY_CLIENT_SECRET is not set. Dynamic Client Registration (DCR) will not work.");
}

export const config = {
  apiKey: API_KEY || "",
  /** Base URL with trailing slash removed */
  baseUrl: MAXIMO_URL?.replace(/\/$/, "") || "",
  port: Number(process.env.PORT) || 3030,
  mcpApiKey: MCP_API_KEY || "",
  /** Authentication provider: 'static' (default) or 'entra-id' */
  authProvider: AUTH_PROVIDER as "static" | "entra-id",
  /** Transport mode: 'http' (default) or 'stdio' for local MCP clients */
  transport: TRANSPORT as "http" | "stdio",
  /** Canonical URI of this MCP server (used in RFC 9728 metadata) */
  serverBaseUrl: MCP_SERVER_BASE_URL,
  azure: {
    tenantId: AZURE_TENANT_ID,
    clientId: AZURE_CLIENT_ID,
    audience: AZURE_AUDIENCE,
    /** Pre-registered Client App used internally to proxy OAuth flows for DCR clients */
    proxyClientId: AZURE_PROXY_CLIENT_ID,
    proxyClientSecret: AZURE_PROXY_CLIENT_SECRET,
    /** This server's own API scope (api://<client-id>/mcp.access) */
    apiScope: `api://${AZURE_CLIENT_ID}/mcp.access`,
    /** Scope sent to Entra ID when the MCP client omits one */
    defaultScope: `api://${AZURE_CLIENT_ID}/mcp.access offline_access openid profile`,
  },
  /** File path used to persist DCR client registrations across restarts */
  dcrStorePath: DCR_STORE_PATH,
} as const;
