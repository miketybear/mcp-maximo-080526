import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { toNodeHandler } from "@modelcontextprotocol/node";
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
  "for the vendor code using search_vendor first, then use search_purchase_orders with the vendor code. " +
  "4. For Locations (equipment tags): ALWAYS highlight Safety Critical Elements (SCE) and Production Critical Elements (PCE) " +
  "whenever a location is shown. Colour code: 🔴 red = SCE, 🟡 yellow = PCE. Tags with a `critical` field are SCE and/or PCE: " +
  "write the tag in bold followed by the `critical` label exactly as returned " +
  "(e.g. **HT-PSV-7001** 🔴 SCE (BD-PC007 Relief Systems), **HT-P-4415C** 🟡 PCE); in tables put the label in its own column. " +
  "Use only these emoji for colour — do not use HTML <span>/<font>, LaTeX \color or other colour markup, which most chat clients " +
  "strip or show as raw text. When listing several tags state how many are SCE / PCE. " +
  "When the user asks for a tree / hierarchy / structure, display the `tree` field returned by get_location_children or " +
  "get_location_ancestors verbatim inside a code block (do not reformat it), followed by its legend. " +
  "5. For Investigations and Action Tracking (Oil): investigations (incidents, failures, RCAs) raise follow-up actions. " +
  "Find investigations with search_investigations, then get_investigation / list_actions_by_investigation; " +
  "find actions with search_action_tracking (open / overdue / by PIC) and count them with summarize_action_tracking. " +
  "Always mention overdue actions (overdue: true) and apply the same SCE / PCE highlighting to their `critical` field. " +
  "6. Equipment-centric WO questions: many PM WOs cover several tags in their Multi Assets list (their own location is a group " +
  "or empty) — search_work_orders matches both by default (tagScope='both'). Use summarize_work_orders_by_tag for statistics " +
  "about one tag and get_pm_coverage to find tags under a location without PM, late, or without a PM plan. " +
  "7. When the user asks what this connector / Maximo can do (e.g. 'tôi có thể làm gì với connector Maximo?', " +
  "'what can I ask?', 'hướng dẫn sử dụng'), do NOT call any tool: answer in the user's language with a short list of the " +
  "areas below, 2–3 example questions each, and note that data is read-only (nothing is changed in Maximo). " +
  "Areas and example questions: " +
  "Work Orders — 'Liệt kê WO PM đang mở của tag HT-P-7010B', 'Backlog WO của tổ MECH tháng này', " +
  "'Chi tiết WO H14237007 kèm danh sách thiết bị (multi asset) và vật tư', 'WO SCE nào quá hạn tuần này?'. " +
  "Equipment maintenance history & statistics — 'HT-P-7010B năm nay được PM mấy lần, lần cuối khi nào?', " +
  "'Phân tích lịch sử sửa chữa và vật tư đã dùng cho HT-P-4415C', " +
  "'Thiết bị nào dưới HT-AHW chưa được PM năm 2026? Thiết bị SCE nào quá hạn?'. " +
  "Locations / tags — 'HT-PSV-7001 thuộc hệ thống nào? Vẽ cây cha', 'Dưới HT-SK-2800 có những thiết bị gì?', " +
  "'Đếm số tag SCE theo nhóm SCE', 'Liệt kê các hệ thống chức năng (Fire Water, Cooling Medium…)'. " +
  "Purchase Orders & vendors — 'PO đã duyệt của nhà cung cấp X năm 2026', 'Chi tiết PO 12345', " +
  "'Các PO dùng mã ngân sách Y'. " +
  "Budget & currency — 'Ngân sách được duyệt / còn lại của mã ngân sách Y', 'Tỷ giá VND/USD hiện tại', " +
  "'Quy đổi 250 triệu VND sang USD'. " +
  "Investigations & Action Tracking (HSE) — 'Các investigation sự cố năm nay', " +
  "'Action đang quá hạn của tôi / của phòng X', 'Thống kê action theo trạng thái và PIC', " +
  "'Action nào sinh ra từ investigation Z?'. " +
  "End with one line inviting the user to ask in their own words (tag, WO number, PO number, vendor name or a period are enough).";

/**
 * The tool list and server info only change on redeploy, so 2026-07-28 clients
 * may cache them. `private`: responses sit behind per-user auth.
 * (2025-era responses are never affected by cache hints.)
 */
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Factory for a fresh MCP server with all tools registered. The SDK calls it
 * per HTTP request (stateless) and once per stdio connection.
 */
function createServer(): McpServer {
  const server = new McpServer(
    { name: "maximo-mcp-server", version: "0.2.0" },
    {
      instructions: INSTRUCTIONS,
      cacheHints: {
        "tools/list": { ttlMs: ONE_HOUR_MS, cacheScope: "private" },
        "server/discover": { ttlMs: ONE_HOUR_MS, cacheScope: "private" },
      },
    },
  );
  registerAllTools(server);
  return server;
}

const logError = (scope: string) => (error: Error) => console.error(`[${scope}]`, error);

console.error(`[registry] ${tools.length} tool(s): ${tools.map((t) => t.name).join(", ")}`);

if (config.transport === "stdio") {
  // stdio mode — for local MCP clients (Claude Desktop, Cursor, Gemini CLI, etc.)
  // Auth is handled by the host OS; no Express server needed. serveStdio
  // serves both 2025-era (initialize) and 2026-07-28 openings.
  serveStdio(createServer, { onerror: logError("stdio") });
  console.error("[transport] MCP Server running on stdio");
} else {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (config.authProvider === "entra-id" && config.serverBaseUrl) {
    mountOAuthProxy(app);
  }

  // Streamable HTTP. createMcpHandler serves 2026-07-28 requests natively and,
  // with the default `legacy: 'stateless'`, answers 2025-era clients (Claude,
  // ChatGPT today) with a fresh server per request. GET/DELETE get 405.
  const mcp = toNodeHandler(createMcpHandler(createServer, { onerror: logError("mcp") }), {
    onerror: logError("mcp-adapter"),
  });
  // Pass the body express.json() already consumed as parsedBody.
  const mcpHandler: express.RequestHandler = (req, res) => mcp(req, res, req.body);

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
