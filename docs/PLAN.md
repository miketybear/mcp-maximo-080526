# Kế hoạch nâng cấp MCP TypeScript SDK v1 → v2

> Trạng thái: **Đề xuất** · Ngày lập: 2026-11-18 · Checklist chi tiết: [TASKS.md](TASKS.md)

## 1. Bối cảnh

| | Hiện tại | Mục tiêu |
|---|---|---|
| SDK | `@modelcontextprotocol/sdk` 1.32.2 (1 package) | `@modelcontextprotocol/server` 2.4.x + `@modelcontextprotocol/node` 2.1.x (hoặc `/express` 2.0.x) |
| Spec | 2025-11-25 (stateful handshake, server tự làm stateless) | Phục vụ cả 2025-11-25 **và** 2026-07-28 (stateless) |
| Zod | 4.4.x | ≥ 4.2 (đã đạt) |
| Node | Docker `node:20-alpine`, dev 26 | ≥ 20 (đã đạt) |

Code đã được refactor trước để việc nâng cấp nhỏ nhất có thể: mọi chỗ dùng SDK chỉ nằm ở **`src/index.ts`** và **`src/tools/define-tool.ts`** (+ import type ở `tools/index.ts`). Các tool, `maximo-client.ts`, `auth.ts`, `oauth-proxy.ts`, `dcr.ts` không import SDK.

## 2. Mục tiêu

1. Chạy trên SDK v2, không đổi hành vi 10 tool hiện có.
2. Client cũ (Claude, ChatGPT đang nói 2025-11-25) vẫn hoạt động — không có downtime cho người dùng.
3. Sẵn sàng spec 2026-07-28: bỏ handshake/session, header `Mcp-Method`/`Mcp-Name`, cache `tools/list`.
4. Bỏ cách "tạo server + transport thủ công mỗi request" bằng `createMcpHandler(factory)` chuẩn của v2.

**Ngoài phạm vi:** đổi cơ chế auth (DCR → CIMD), thêm tool mới, MCP Apps, elicitation/MRTR.

## 3. Thay đổi kỹ thuật chính

| Hạng mục | v1 (hiện tại) | v2 |
|---|---|---|
| Import server | `@modelcontextprotocol/sdk/server/mcp.js` | `@modelcontextprotocol/server` |
| stdio | `server.connect(new StdioServerTransport())` | `serveStdio(() => createServer())` từ `@modelcontextprotocol/server/stdio` |
| HTTP | `new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` + `server.connect` mỗi request | `toNodeHandler(createMcpHandler(() => createServer()))` (`@modelcontextprotocol/node`) gắn vào route Express hiện có |
| Client đời cũ | — | mặc định `legacy: 'stateless'` phục vụ client 2025 theo từng request (đúng mô hình hiện tại); GET/DELETE trả 405 |
| inputSchema | raw shape `{ a: z.string() }` | `z.object({...})` (raw shape vẫn chạy qua overload `@deprecated`) |
| Lỗi giao thức | `McpError`, `ErrorCode` | `ProtocolError`, `ProtocolErrorCode` (hiện không dùng) |
| Annotations / ToolAnnotations type | `sdk/types.js` | export từ `@modelcontextprotocol/server` (cần xác minh) |

**Quyết định thiết kế:**
- **Giữ Express + auth/OAuth proxy tự viết.** Không dùng `mcpAuthRouter`/`ProxyOAuthServerProvider` (đã bị đóng băng ở `server-legacy`). Chỉ thay phần xử lý `/mcp`.
- **Ưu tiên `@modelcontextprotocol/node` (`toNodeHandler`) hơn `createMcpExpressApp`**, vì app Express đã có middleware riêng (body parser, CORS, OAuth). Cần kiểm tra handler v2 có đọc lại body đã bị `express.json()` parse hay không (xem rủi ro R2).
- Chuyển input schema sang `z.object()` ngay trong đợt này (codemod làm được) để tránh overload deprecated.

## 4. Các giai đoạn

| # | Giai đoạn | Nội dung | Kết quả |
|---|---|---|---|
| 0 | Chuẩn bị | Commit refactor hiện tại, tạo branch `feat/sdk-v2`, ghi lại baseline (tools/list, 3 tool call mẫu, luồng OAuth) | Baseline để so sánh |
| 1 | Nâng cấp package | Chạy codemod `--dry-run`, rồi chạy thật; sửa tay các chỗ `@mcp-codemod-error`; pin version chính xác | Build pass |
| 2 | Transport | Thay `mcpHandler` bằng `createMcpHandler` + `toNodeHandler`; stdio dùng `serveStdio` | `/mcp` chạy với client 2025 |
| 3 | Schema & tool | `z.object()` cho input schema, kiểm tra `define-tool.ts` với kiểu handler mới, `ToolAnnotations` | 10 tool trả kết quả giống baseline |
| 4 | Spec 2026-07-28 | Bật/kiểm tra phục vụ request 2026 (`server/discover`, header bắt buộc, `ttlMs` cho `tools/list`) | Test được bằng client v2 ở chế độ `versionNegotiation: 'auto'` |
| 5 | Kiểm thử | Test local (static + entra-id), test hồi quy OAuth, Docker build | Checklist TASKS.md xanh |
| 6 | Triển khai | Deploy staging/prod, kết nối lại Claude + ChatGPT, theo dõi log 1–2 ngày | Production chạy v2 |
| 7 | Dọn dẹp | Cập nhật docs, `adding_tools_guide.md`, CLAUDE.md | Docs khớp code |

Ước lượng: **2–3 ngày công** (phần lớn là kiểm thử và xác minh client), rủi ro chính ở giai đoạn 2 và 6.

## 5. Rủi ro & giảm thiểu

| ID | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| R1 | Client (Claude, ChatGPT) xử lý khác khi server v2 trả lời | Trung bình | Giữ `legacy: 'stateless'`; test thật với từng client trước khi tắt bản cũ; giữ image Docker v1 để rollback |
| R2 | `toNodeHandler` cần body thô nhưng `express.json()` đã đọc body | Trung bình | Kiểm tra API có nhận `parsedBody`; nếu không, bỏ `express.json()` khỏi route `/mcp` |
| R3 | v2 vẫn đang thay đổi nhanh (2.0 → 2.4 trong vài tháng) | Trung bình | Pin version chính xác (không dùng `^`), đọc changelog trước mỗi lần nâng |
| R4 | Header `Mcp-Method`/`Mcp-Name` bị Nginx chặn/lọc | Thấp | Kiểm tra `nginx.conf` không strip header; test qua domain thật |
| R5 | DCR bị deprecate ở spec 2026-07-28 | Thấp (ngắn hạn) | Ngoài phạm vi; giữ DCR vì client hiện tại vẫn dùng. Theo dõi hỗ trợ CIMD của Claude/ChatGPT, lập kế hoạch riêng |
| R6 | Lỗi xác thực trả 500 thay vì 401 làm client không re-auth | Thấp | Đã sửa trong `auth.ts`; giữ test hồi quy |

## 6. Rollback

- Image Docker hiện tại được tag `mcp-maximo:v1-<commit>` trước khi deploy.
- Rollback = checkout commit v1 trên server + `docker compose up -d --build` (hoặc chạy lại image đã tag). DCR store (`data/`) không đổi định dạng nên dùng chung được.

## 7. Tiêu chí hoàn thành

- `npm run build` pass, không còn import `@modelcontextprotocol/sdk`.
- 10 tool trả kết quả giống baseline (so sánh JSON).
- Luồng OAuth: metadata, `/register`, `/authorize`, `/token`, 401 + `WWW-Authenticate` — giống kết quả test trước nâng cấp.
- Claude (web/desktop) và ChatGPT kết nối, đăng nhập và gọi tool thành công trên production.
- Client spec 2026-07-28 (SDK v2 client, `versionNegotiation: 'auto'`) gọi được `tools/list` và `tools/call`.

## 8. Nguồn

- v2 docs & migration: https://ts.sdk.modelcontextprotocol.io/v2/ (mục *Upgrade to v2*, *Support 2026-07-28*, *Serving › Express / Legacy clients / Authorization*)
- Spec 2026-07-28: https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- Một số chi tiết (annotations, kiểu kết quả tool, việc DCR bị deprecate) chưa được xác minh trực tiếp trên tài liệu chính thức — đã đưa vào TASKS.md để kiểm tra ở giai đoạn 1.
