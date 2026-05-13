import "dotenv/config";

const API_KEY = process.env.API_KEY;
const MAXIMO_URL = process.env.MAXIMO_URL;
const MCP_API_KEY = process.env.MCP_API_KEY;

if (!API_KEY) {
  console.warn("WARNING: API_KEY environment variable is not set.");
}
if (!MAXIMO_URL) {
  console.warn("WARNING: MAXIMO_URL environment variable is not set. API calls will fail.");
}
if (!MCP_API_KEY) {
  console.warn("WARNING: MCP_API_KEY environment variable is not set. Server is running WITHOUT authentication.");
}

export const config = {
  apiKey: API_KEY || "",
  /** Base URL with trailing slash removed */
  baseUrl: MAXIMO_URL?.replace(/\/$/, "") || "",
  port: Number(process.env.PORT) || 3030,
  mcpApiKey: MCP_API_KEY || "",
} as const;
