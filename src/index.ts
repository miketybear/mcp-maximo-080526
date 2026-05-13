import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { config } from "./config.js";
import { registerAllTools } from "./tools/index.js";

const server = new McpServer(
  { name: "maximo-mcp-server", version: "0.1.0" },
  { instructions: "Use the provided tools to interact with the Maximo REST API. Prefer searching for work orders to get the exact wonum before calling get_work_order. Always summarize data from the description_longdescription field before presenting/outputting it to the user." },
);

registerAllTools(server);

// Authentication middleware for Bearer Token
const authMiddleware: express.RequestHandler = (req, res, next) => {
  const expectedApiKey = config.mcpApiKey;
  
  // If no MCP_API_KEY is configured on the server, skip verification (development mode)
  if (!expectedApiKey) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid Authorization header. Expected Bearer Token."
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (token !== expectedApiKey) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid API Key."
    });
    return;
  }

  next();
};

// Streamable HTTP transport (stateless mode)
  const app = express();
  app.use(express.json());

  app.post("/mcp", authMiddleware, async (req, res) => {
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

  app.listen(config.port, () => {
    console.log(`MCP Server running on http://localhost:${config.port}/mcp`);
    console.log(`Health check available at http://localhost:${config.port}/health`);
  });
