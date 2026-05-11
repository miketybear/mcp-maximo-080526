import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

const API_KEY = process.env.API_KEY;
const MAXIMO_URL = process.env.MAXIMO_URL;

if (!API_KEY) {
  console.warn("WARNING: API_KEY environment variable is not set.");
}
if (!MAXIMO_URL) {
  console.warn("WARNING: MAXIMO_URL environment variable is not set. API calls will fail.");
}

// Remove trailing slash if present
const baseUrl = MAXIMO_URL?.replace(/\/$/, "") || "";

const upstreamApi = {
  async fetchMaximo(endpoint: string, params: Record<string, string | number | undefined> = {}) {
    const url = new URL(`${baseUrl}${endpoint}`);
    
    // Always append lean=1 for NextGen API per best practices
    url.searchParams.append("lean", "1");
    
    // Append other params
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });

    console.log(`[upstream] Requesting: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      headers: {
        'apikey': API_KEY || "",
      }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Maximo API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  },

  async searchWorkOrders(
    wonum?: string,
    description?: string,
    status?: string,
    siteid?: string,
    bdpocdiscipline?: string,
    limit: number = 10
  ) {
    // Build the oslc.where string based on provided fields
    const whereConditions: string[] = [];
    
    if (wonum) whereConditions.push(`wonum="${wonum}"`);
    if (description) whereConditions.push(`description="%${description}%"`);
    if (status) whereConditions.push(`status="${status}"`);
    if (siteid) whereConditions.push(`siteid="${siteid}"`);
    if (bdpocdiscipline) whereConditions.push(`bdpocdiscipline="${bdpocdiscipline}"`);

    const params: Record<string, string | number> = {
      "oslc.pageSize": limit
    };

    if (whereConditions.length > 0) {
      params["oslc.where"] = whereConditions.join(" and ");
    }

    // Default select attributes as requested
    params["oslc.select"] = "wonum,description,status,reportdate,assetnum,location,bdpocdiscipline,worktype,schedstart,schedfinish,estdur,wopriority";

    return this.fetchMaximo('/api/os/mxwodetail', params);
  },

  async getWorkOrder(wonum: string) {
    // Fetch exact match by wonum
    const params = {
      "oslc.where": `wonum="${wonum}"`,
      "oslc.select": "wonum,description,status,siteid,reportdate,assetnum,location,bdpocdiscipline,worktype,schedstart,schedfinish,estdur,wopriority"
    };

    return this.fetchMaximo('/api/os/mxwodetail', params);
  }
};

const server = new McpServer(
  { name: "maximo-mcp-server", version: "0.1.0" },
  { instructions: "Use the provided tools to interact with the Maximo REST API. Prefer searching for work orders to get the exact wonum before calling get_work_order." },
);

server.registerTool(
  "search_work_orders",
  {
    description: "Search Maximo Work Orders by various criteria. Returns matching records up to the specified limit.",
    inputSchema: {
      wonum: z.string().optional().describe("Work Order number (exact match)"),
      description: z.string().optional().describe("Partial match on the description"),
      status: z.string().optional().describe("Work Order status (e.g., APPR, INPRG)"),
      siteid: z.string().optional().describe("Site ID (e.g., BD1)"),
      bdpocdiscipline: z.string().optional().describe("Discipline code for the work order, e.g., MECH, E&I, PROD, RES"),
      limit: z.number().int().min(1).max(100).default(10).describe("Maximum number of records to return"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ wonum, description, status, siteid, bdpocdiscipline, limit }) => {
    try {
      const results = await upstreamApi.searchWorkOrders(wonum, description, status, siteid, bdpocdiscipline, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error searching work orders: ${e.message}` }],
      };
    }
  },
);

server.registerTool(
  "get_work_order",
  {
    description: "Fetch detailed information for a specific Maximo Work Order by its wonum.",
    inputSchema: { 
      wonum: z.string().describe("The exact Work Order number") 
    },
    annotations: { readOnlyHint: true },
  },
  async ({ wonum }) => {
    try {
      const results: any = await upstreamApi.getWorkOrder(wonum);
      
      // Since oslc.where returns a collection (even for 1 item), we can pull out the member if it exists
      const member = results?.member?.[0] || results;

      return { 
        content: [{ type: "text", text: JSON.stringify(member, null, 2) }] 
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error fetching work order: ${e.message}` }],
      };
    }
  },
);

// Streamable HTTP transport (stateless mode)
const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, 
  });
  
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Health check endpoint for host verification
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Server running on http://localhost:${PORT}/mcp`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
});
