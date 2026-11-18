# TASKS — Nâng cấp SDK v2

Checklist cho [PLAN.md](PLAN.md). Đánh dấu `[x]` khi xong; ghi chú phát hiện ngay dưới task.

## Giai đoạn 0 — Chuẩn bị

- [ ] Commit refactor hiện tại (defineTool, query builder, oauth-proxy, sửa CORS/401) lên `main`
- [ ] Tạo branch `feat/sdk-v2`
- [ ] Ghi baseline vào `docs/baseline/` (không commit dữ liệu nhạy cảm):
  - [ ] `tools/list` → `tools-list.json`
  - [ ] `get_exchange_rate {currencycode: VND}` → JSON
  - [ ] `search_work_orders {location: <tag thật>, limit: 2}` → JSON
  - [ ] `get_purchase_order {ponum: <PO thật>}` → JSON
  - [ ] Kết quả test OAuth (metadata, register, authorize redirect, token lỗi, 401) → `oauth.txt`
- [ ] Tag image Docker hiện tại trên server: `mcp-maximo:v1-<commit>`
- [ ] Đọc changelog `@modelcontextprotocol/server` từ 2.0 → bản mới nhất, chọn version để pin

## Giai đoạn 1 — Nâng cấp package

- [ ] `npx @modelcontextprotocol/codemod@latest v1-to-v2 . --dry-run` và đọc diff
- [ ] Chạy codemod thật
- [ ] `grep -rn '@mcp-codemod-error' src` → sửa tay từng chỗ
- [ ] `package.json`: gỡ `@modelcontextprotocol/sdk`; thêm `@modelcontextprotocol/server` và `@modelcontextprotocol/node` với **version chính xác** (không `^`)
- [ ] Xác nhận `zod` ≥ 4.2 (đang 4.4.x) và không còn import `zod/v3`
- [ ] Xác minh trên docs v2 (đã ghi chưa chắc chắn trong PLAN):
  - [ ] Đường import `ToolAnnotations` và kiểu kết quả tool (`CallToolResult`)
  - [ ] Trạng thái DCR / CIMD trong spec 2026-07-28
- [ ] `npm run build` pass

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
