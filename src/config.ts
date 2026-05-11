import "dotenv/config";

const API_KEY = process.env.API_KEY;
const MAXIMO_URL = process.env.MAXIMO_URL;

if (!API_KEY) {
  console.warn("WARNING: API_KEY environment variable is not set.");
}
if (!MAXIMO_URL) {
  console.warn("WARNING: MAXIMO_URL environment variable is not set. API calls will fail.");
}

export const config = {
  apiKey: API_KEY || "",
  /** Base URL with trailing slash removed */
  baseUrl: MAXIMO_URL?.replace(/\/$/, "") || "",
  port: Number(process.env.PORT) || 3000,
} as const;
