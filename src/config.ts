import "dotenv/config";

const API_KEY = process.env.API_KEY;
const MAXIMO_URL = process.env.MAXIMO_URL;
const MCP_API_KEY = process.env.MCP_API_KEY;
const AUTH_PROVIDER = process.env.AUTH_PROVIDER || "static";
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID || "";
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID || "";
// Audience defaults to the standard Entra ID app URI if not explicitly overridden
const AZURE_AUDIENCE = process.env.AZURE_AUDIENCE || `api://${AZURE_CLIENT_ID}`;

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
}

export const config = {
  apiKey: API_KEY || "",
  /** Base URL with trailing slash removed */
  baseUrl: MAXIMO_URL?.replace(/\/$/, "") || "",
  port: Number(process.env.PORT) || 3030,
  mcpApiKey: MCP_API_KEY || "",
  /** Authentication provider: 'static' (default) or 'entra-id' */
  authProvider: AUTH_PROVIDER as "static" | "entra-id",
  azure: {
    tenantId: AZURE_TENANT_ID,
    clientId: AZURE_CLIENT_ID,
    audience: AZURE_AUDIENCE,
  },
} as const;
