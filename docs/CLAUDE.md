# Maximo MCP Server — Agent Instructions

MCP server exposing IBM Maximo (BIENDONG POC) data — Work Orders, Purchase Orders, Vendors, Budget Codes, Exchange Rates — as **read-only** tools for Claude, ChatGPT and other MCP clients.

Production: `https://mcp-server1.biendongpoc.vn/mcp` (Docker + Nginx on Ubuntu, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)).

## Commands

```bash
npm run build        # tsc → dist/ (also the typecheck; there is no test suite yet)
npm start            # tsx src/index.ts (dev)
npm run start:prod   # node dist/index.js
```

There is no `npm test`. Verify changes by building, starting the server on a spare port and calling it over HTTP:

```bash
AUTH_PROVIDER=static MCP_API_KEY=t PORT=3999 node dist/index.js
curl -s localhost:3999/mcp -H "Authorization: Bearer t" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Tool calls hit the **real** Maximo instance in `.env` — only call read-only tools when testing. For Entra ID testing, keep `AUTH_PROVIDER=entra-id` but set `DCR_STORE_PATH` to a temp file so test registrations do not pollute `data/dcr-clients.json`.

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Entry. `createServer()` is the factory: `createMcpHandler` + `toNodeHandler` call it per HTTP request (serves spec 2025-11-25 statelessly and 2026-07-28 natively); `serveStdio` uses it for `TRANSPORT=stdio`. Also sets `cacheHints` for `tools/list`. |
| `src/tools/define-tool.ts` | `defineTool({ name, description, inputSchema, errorLabel, run, annotations? })` — wraps result as JSON text, converts thrown errors to `isError`, defaults `readOnlyHint: true`. |
| `src/tools/index.ts` | `tools` array = the single registry. Adding a tool = new file + one line here. |
| `src/maximo-client.ts` | Maximo REST client. `query(objectStructure, { where, select, orderBy, limit, pageno }, zodSchema)`. |
| `src/types/*.ts` | Zod input shapes (shared by tool + client) and response schemas; re-exported from `types/index.ts`. |
| `src/constants.ts` | Enum values (WO/PO status, discipline, worktype, priority). |
| `src/auth.ts` | Bearer middleware: static `MCP_API_KEY` or Entra ID JWT (jose). |
| `src/oauth-proxy.ts` | Entra ID OAuth proxy: RFC 9728/8414 metadata, `/register` (DCR), `/authorize`, `/token`, CORS. |
| `src/dcr.ts` | DCR client store persisted to `DCR_STORE_PATH`. |
| `src/config.ts` | All env vars. Never hardcode URLs, keys or tenant IDs elsewhere. |

How to add a tool: [adding_tools_guide.md](adding_tools_guide.md). SDK v2 upgrade: [PLAN.md](PLAN.md), [TASKS.md](TASKS.md).

## Rules

- **OSLC injection:** every user-supplied value in `oslc.where` must go through `q()` (exact) or `like()` (contains) in `maximo-client.ts`. Never interpolate raw strings.
- **Never return cancelled records:** `CAN` is excluded from status enums and POs always add `status!="CAN"`. Keep it that way.
- POs: results go through `filterLatestApprovedRevisions` (one row per PONUM). Keep this for any new PO query.
- Keep `oslc.select` lean — only the fields the tool needs. Always `lean=1` (done in `fetchMaximo`).
- Tool `description` and `.describe()` texts are prompts for the LLM: say when to use / not use the tool, give examples, explain pagination. They matter more than code style.
- Tools are read-only. A write tool needs explicit `annotations` (`readOnlyHint: false`) and a separate client method (POST + `x-method-override: PATCH`); confirm with the user before adding one.
- Follow the Maximo REST docs when building new queries: https://ibm-maximo-dev.github.io/maximo-restapi-documentation/
- Stdio mode: log to `stderr` only (`console.error`); stdout is the protocol channel.
- MCP SDK v2: `@modelcontextprotocol/server` + `@modelcontextprotocol/node`, pinned to exact versions — read the changelog before bumping.
- Zod v4 only (`zod ^4`, ≥ 4.2). Tools declare raw shapes; `defineTool` wraps them in `z.object()`.
- `req.auth` is reserved: `toNodeHandler` forwards it as MCP `AuthInfo`. JWT claims live in `res.locals.jwtClaims`.

## OAuth / Entra ID gotchas (easy to regress)

- Metadata routes must match the **path-aware** form `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server/mcp` (regex routes) — Claude's cloud requests these first.
- AS metadata `issuer` must equal `MCP_SERVER_BASE_URL` (the URL advertised in `authorization_servers`).
- `/authorize` and `/token` swap the DCR `client_id` for `AZURE_PROXY_CLIENT_ID` (+ secret on `/token`). Also accept the real proxy client_id directly (Claude "Advanced settings" static Client ID). Do not forward the client's `Authorization` header to Entra.
- Token-shaped failures (bad claims/signature/kid/alg) must return **401**, not 500 — clients only re-auth on 401.
- OAuth endpoints need CORS incl. `OPTIONS` preflight (`app.options(...)` in `oauth-proxy.ts`).
- DCR registrations must persist across restarts (`data/` volume in docker-compose).

## Deployment

- Nginx vhost and log files are named `mxm-mcp-server` even though the domain is `mcp-server1` — do not "fix" the names.
- Server folders (`~/mcp-maximo/` on the host): production runs from `mcp-maximo-v2` (SDK v2, tracks `main`). `mcp-maximo-080526` is the stopped SDK v1 deploy, kept for rollback. A major release goes in a new folder, not an in-place upgrade.
- Both folders share `container_name` and port `127.0.0.1:3030`, so only one runs at a time. Switch by running `docker compose down` in one and `up -d` in the other; Nginx is unchanged.
- The DCR volume is per folder (`<folder>_dcr-data`). Copy it into the new folder before the first `up`, or every client must re-register. Never use `down -v`.
- Redeploy: in `mcp-maximo-v2`, `git pull` then `docker compose up -d --build`, then check `/health` and reconnect a client. Details in [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md); Entra app registration in [azure-guide.md](azure-guide.md).

## Git

- Work on a branch, not `main`, for anything beyond docs. Commit only when asked.
- `.env`, `data/` and DCR files contain secrets / client registrations — never commit them.
