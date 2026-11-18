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

- [ ] `src/index.ts`: thay `mcpHandler` bằng `toNodeHandler(createMcpHandler(() => createServer()))`
- [ ] Giữ thứ tự middleware: `buildAuthMiddleware()` chạy **trước** handler MCP
- [ ] Kiểm tra handler v2 với body đã parse bởi `express.json()` (R2):
  - [ ] Nếu cần body thô → không áp `express.json()` cho `/mcp` (chỉ cho OAuth routes)
- [ ] Xác nhận chế độ legacy mặc định là `stateless` (phục vụ client 2025); không bật `reject`
- [ ] GET/DELETE `/mcp` trả 405 — xác nhận Claude/ChatGPT không phụ thuộc GET SSE
- [ ] stdio: `serveStdio(() => createServer())`; chạy thử `TRANSPORT=stdio` với MCP Inspector hoặc Claude Desktop
- [ ] Giữ route `/` song song `/mcp` (client cũ có thể đang trỏ vào root)
- [ ] Log `[registry]` vẫn in đủ 10 tool khi khởi động

## Giai đoạn 3 — Schema & tool

- [ ] Chuyển input shape trong `src/types/*.ts` sang `z.object({...})` (hoặc để `defineTool` tự bọc — chọn 1 cách, ghi lại)
- [ ] Cập nhật kiểu `z.infer<z.ZodObject<S>>` trong `define-tool.ts` và các `*Input` type tương ứng
- [ ] Bỏ cast `handler as never` nếu kiểu v2 suy ra được; nếu không, ghi chú lý do
- [ ] Kiểm tra `.describe()` vẫn xuất hiện trong JSON Schema của `tools/list` (zod < 4.2 sẽ mất)
- [ ] `annotations` (`readOnlyHint`) vẫn xuất hiện trong `tools/list`
- [ ] So sánh `tools-list.json` với baseline — chỉ được khác ở phần do spec thêm vào

## Giai đoạn 4 — Spec 2026-07-28

- [ ] Gọi `server/discover` bằng client SDK v2 (`versionNegotiation: { mode: 'auto' }`) → nhận capabilities
- [ ] Request 2026 với header `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` → `tools/call` thành công
- [ ] Header sai → HTTP 400 / mã `-32020` (xác nhận do SDK xử lý, không cần code)
- [ ] Đặt `ttlMs` cho `tools/list` nếu SDK hỗ trợ cấu hình (danh sách tool tĩnh → có thể cache lâu)
- [ ] `nginx.conf`: xác nhận không lọc header `Mcp-*` và `MCP-Protocol-Version` (R4)

## Giai đoạn 5 — Kiểm thử

**Local, `AUTH_PROVIDER=static`:**
- [ ] `tools/list` đủ 10 tool
- [ ] 3 tool call baseline cho kết quả giống hệt
- [ ] 4–5 request song song trả đúng `id` của mình
- [ ] Giá trị có dấu `"` trong filter không chèn thêm điều kiện được (kiểm tra URL upstream trong log)
- [ ] Không token → 401

**Local, `AUTH_PROVIDER=entra-id`** (đặt `DCR_STORE_PATH` ra file tạm):
- [ ] `/.well-known/oauth-protected-resource/mcp` và `/.well-known/oauth-authorization-server/mcp` → 200, nội dung giống baseline
- [ ] `OPTIONS` các route OAuth → 204 + `Access-Control-Allow-Origin`
- [ ] `POST /register` → 201 + `client_id`
- [ ] `/authorize` client đã đăng ký → 302 sang Entra, `client_id` = proxy client
- [ ] `/authorize` client lạ → 400 `invalid_client`
- [ ] `/token` code giả → Entra trả `invalid_grant`
- [ ] `/mcp` không token / token giả → 401 + `WWW-Authenticate`

**Build:**
- [ ] `docker compose build` thành công trên `node:20-alpine`
- [ ] Container khởi động, `/health` → 200

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
