# TASKS — Nâng cấp SDK v2

Checklist cho [PLAN.md](PLAN.md). Đánh dấu `[x]` khi xong; ghi chú phát hiện ngay dưới task.

## Giai đoạn 0 — Chuẩn bị

- [x] Commit refactor hiện tại (defineTool, query builder, oauth-proxy, sửa CORS/401) lên `main`
  - `6444199`, `1d0499e` — đã merge vào `main` local, **chưa push**
- [x] Tạo branch `feat/sdk-v2`
- [x] Ghi baseline vào `docs/baseline/v1/` (thư mục đã đưa vào `.gitignore`, chứa dữ liệu Maximo thật):
  - [x] `tools/list` → `tools-list.json`
  - [x] `get_exchange_rate {currencycode: VND, asOfDate: 2026-11-18}` → JSON
  - [x] `search_work_orders {location: HT-PM-4415C, limit: 2}` → JSON
  - [x] `get_purchase_order {ponum: H13110952}` → JSON
  - [x] Ca lỗi `get_exchange_rate {currencycode: XXX}` → `error_case.json`
  - [x] Kết quả test OAuth (metadata, CORS, register, authorize, token lỗi, 401) → `oauth.txt`
  - Script tái sử dụng: `scripts/migration/baseline.mjs <base> <outDir> [location] [ponum]` và `scripts/migration/oauth-check.sh <base> <proxyClientId>`
- [ ] Tag image Docker hiện tại trên server: `mcp-maximo:v1-<commit>` — **cần làm trên server trước khi deploy (Giai đoạn 6)**
- [x] Đọc changelog `@modelcontextprotocol/server` từ 2.0 → bản mới nhất, chọn version để pin
  - Chọn `@modelcontextprotocol/server` **2.4.0** + `@modelcontextprotocol/node` **2.1.2** (bản mới nhất, 2026-10-23; 2.0.0 stable từ 2026-07-27)
  - Lưu ý 2.4.0 không ảnh hưởng dự án: `x-mcp-header` trên tham số `number` bị từ chối (không dùng), `outputSchema` với `.meta({id})` (không dùng), Ajv/fast-uri chặt hơn với `$id`/`$ref` (không dùng)
  - 2.4.0 có `scopeForRefresh` cho Entra ID (`AADSTS90009`) — chỉ dành cho phía client, không áp dụng cho proxy của ta

## Giai đoạn 1 — Nâng cấp package

- [x] `npx @modelcontextprotocol/codemod@2.4.0 v1-to-v2 . --dry-run` và đọc diff — 6 thay đổi / 3 file, 1 cảnh báo
- [x] Chạy codemod thật — đổi import ở `index.ts`, `define-tool.ts`, `tools/index.ts`; `StreamableHTTPServerTransport` → `NodeStreamableHTTPServerTransport`
- [x] `grep -rn '@mcp-codemod-error' src` → sửa tay từng chỗ
  - 1 chỗ ở `define-tool.ts` (raw shape): giờ bọc `z.object(def.inputSchema)` trong `defineTool`; các tool và type vẫn khai báo raw shape (quyết định cho Giai đoạn 3)
- [x] `package.json`: gỡ `@modelcontextprotocol/sdk`; thêm `@modelcontextprotocol/server@2.4.0` và `@modelcontextprotocol/node@2.1.2` (pin chính xác, `--save-exact`)
- [x] Xác nhận `zod` ≥ 4.2 (4.4.x) và không còn import `zod/v3`
- [ ] Xác minh trên docs v2 (đã ghi chưa chắc chắn trong PLAN):
  - [x] Đường import `ToolAnnotations`: `@modelcontextprotocol/server` (typecheck pass)
  - [ ] Kiểu kết quả tool (`CallToolResult`) — handler vẫn cần cast `as never`; xem lại ở Giai đoạn 3
  - [ ] Trạng thái DCR / CIMD trong spec 2026-07-28 — chưa xác minh trên spec chính thức
- [x] `npm run build` pass
- [x] Smoke test (static auth, transport vẫn là `NodeStreamableHTTPServerTransport` theo request) so với baseline → `docs/baseline/v2-phase1/`
  - 4 tool call: **giống hệt** v1
  - `tools/list`: 10 tool, description và `.describe()` giữ nguyên; chỉ khác `inputSchema.$schema` (draft-07 → 2020-12) và mất trường `execution: {taskSupport: "forbidden"}`

## Giai đoạn 2 — Transport

- [x] `src/index.ts`: thay `mcpHandler` bằng `toNodeHandler(createMcpHandler(createServer, { onerror }))`
- [x] Giữ thứ tự middleware: `buildAuthMiddleware()` chạy **trước** handler MCP
- [x] Kiểm tra handler v2 với body đã parse bởi `express.json()` (R2):
  - `toNodeHandler` nhận tham số thứ 3 `parsedBody` → truyền `req.body`; giữ nguyên `express.json()` toàn cục. **R2 đã xử lý.**
- [x] Xác nhận chế độ legacy mặc định là `stateless` (phục vụ client 2025); không bật `reject`
- [x] GET/DELETE `/mcp` trả 405 — client v2 ở chế độ legacy thử GET (SSE), nhận 405 và vẫn chạy bình thường
  - Claude/ChatGPT thật: cần xác nhận khi deploy (Giai đoạn 6)
- [x] stdio: `serveStdio(createServer, { onerror })`; test bằng client v2 qua stdio: legacy (2025-11-25) và auto (2026-07-28) đều OK
- [x] Giữ route `/` song song `/mcp` (POST `/` → 200)
- [x] Log `[registry]` vẫn in đủ 10 tool khi khởi động
- [x] `auth.ts`: claims JWT chuyển từ `req.auth` sang `res.locals.jwtClaims` — `toNodeHandler` đọc `req.auth` như `AuthInfo` của MCP, payload JWT thô không đúng kiểu đó

## Giai đoạn 3 — Schema & tool

- [x] Chọn cách: `defineTool` bọc `z.object(def.inputSchema)`; các file `types/*.ts` và tool giữ raw shape (dùng chung với kiểu input của `maximo-client`)
- [x] Kiểu trong `define-tool.ts`: handler trả `CallToolResult` (import từ `@modelcontextprotocol/server`)
- [x] Bỏ được cast `handler as never` — kiểu v2 suy ra đúng từ `z.object(...)`
- [x] `.describe()` vẫn xuất hiện trong JSON Schema của `tools/list`
- [x] `annotations` (`readOnlyHint`) vẫn xuất hiện trong `tools/list`
- [x] So sánh với baseline (`docs/baseline/v2-phase2/`): 4 tool call **giống hệt** v1; `tools/list` chỉ khác `$schema` (draft-07 → 2020-12) và mất `execution.taskSupport`
- [x] Tham số sai (`limit: 999`) → `isError: true` "Input validation error" ở cả 2 era

## Giai đoạn 4 — Spec 2026-07-28

- [x] Client SDK v2 `versionNegotiation: { mode: 'auto' }` → `server/discover` → era `modern`, version `2026-07-28`; `tools/list` + `tools/call` OK
- [x] `{ pin: '2026-07-28' }` cũng OK; chế độ `legacy` → `2025-11-25` OK
- [x] Request 2026 có đủ header `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` (đã quan sát trên wire); không có `Mcp-Session-Id`
- [x] Header sai (`Mcp-Name` khác body) → HTTP 400, mã `-32020`, do SDK tự xử lý; server log qua `onerror`
- [x] `cacheHints` cho `tools/list` và `server/discover`: `ttlMs: 3600000`, `cacheScope: 'private'` (có trong response 2026; response 2025 không đổi)
- [x] `nginx.conf`: `location /` dùng `proxy_pass` mặc định, không lọc header `Mcp-*` / `MCP-Protocol-Version` (R4 không xảy ra)
  - Ghi chú: CORS của nginx chỉ áp cho route OAuth. Client chạy trong trình duyệt gọi thẳng `/mcp` theo spec 2026 sẽ cần thêm `Mcp-Method, Mcp-Name, MCP-Protocol-Version` vào `Access-Control-Allow-Headers` — hiện chưa cần vì Claude/ChatGPT gọi từ server

**Script test (ngoài repo, chạy với `@modelcontextprotocol/client@2.4.0`):** test 3 era qua HTTP, header mismatch, stdio 2 era. Kết quả OAuth v2 (`oauth.txt`) **giống hệt** baseline v1.

## Giai đoạn 5 — Kiểm thử

**Local, `AUTH_PROVIDER=static`** (chạy ở Giai đoạn 2–4, lặp lại trên image Docker):
- [x] `tools/list` đủ 10 tool
- [x] 3 tool call baseline + ca lỗi cho kết quả giống hệt v1
- [x] 5 request song song trả đúng `id` của mình
- [x] Giá trị có dấu `"` trong filter không chèn thêm điều kiện được (kiểm tra URL upstream)
- [x] Không token → 401

**Local, `AUTH_PROVIDER=entra-id`** (`scripts/migration/oauth-check.sh`, so với `docs/baseline/v1/oauth.txt` → **giống hệt**):
- [x] `/.well-known/oauth-protected-resource/mcp` và `/.well-known/oauth-authorization-server/mcp` → 200, nội dung giống baseline
- [x] `OPTIONS` các route OAuth → 204 + `Access-Control-Allow-Origin`
- [x] `POST /register` → 201 + `client_id`
- [x] `/authorize` client đã đăng ký → 302 sang Entra, `client_id` = proxy client
- [x] `/authorize` client lạ → 400 `invalid_client`
- [x] `/token` code giả → Entra trả `invalid_grant`
- [x] `/mcp` không token / token giả → 401 + `WWW-Authenticate`

**Build:**
- [x] Cài chỉ dependency production (`npm ci --omit=dev`) → chạy `dist/` được, kết quả giống baseline
- [x] `docker compose build` thành công trên `node:20-alpine` (image 236 MB)
- [x] Container khởi động (Node 20.20.2, user `node`), `/health` → 200
- [x] Trong container: tool call + `tools/list` giống baseline; client v2 legacy/auto/pin đều OK; OAuth giống hệt v1
- [x] DCR ghi được vào `/app/data/dcr-clients.json` (quyền `node:node`)

## Giai đoạn 6 — Triển khai

- [ ] Deploy lên `mcp-server1` (xem [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md))
- [ ] Claude (claude.ai / Desktop): ngắt kết nối connector → kết nối lại → đăng nhập Entra → gọi 3 tool baseline
- [ ] ChatGPT (Developer mode connector): kết nối lại → đăng nhập Entra → gọi 3 tool baseline
- [ ] Theo dõi log 1–2 ngày: lỗi 4xx/5xx bất thường, lỗi `[auth]`, lỗi `[upstream]`
- [ ] Nếu lỗi nghiêm trọng → rollback theo PLAN mục 6

## Giai đoạn 7 — Dọn dẹp & tài liệu

- [ ] `docs/CLAUDE.md`: cập nhật import path, mô tả transport v2, bỏ ghi chú "SDK v1 raw shapes"
- [ ] `docs/adding_tools_guide.md`: ví dụ dùng `z.object()`
- [ ] `docs/DEPLOYMENT_GUIDE.md`: ghi chú phiên bản SDK/spec, cách rollback
- [ ] `.agents/skills/mcp-server-dev/references/versions.md`: cập nhật version đã xác minh
- [ ] Xoá `docs/baseline/` hoặc chuyển ra ngoài repo
- [ ] Mở PR `feat/sdk-v2` → `main`, kèm kết quả kiểm thử

## Theo dõi sau nâng cấp (ngoài phạm vi)

- [ ] Kế hoạch riêng: DCR → Client ID Metadata Documents khi Claude/ChatGPT hỗ trợ
- [ ] Viết test tự động (vitest) cho `maximo-client` query builder và OAuth routes
