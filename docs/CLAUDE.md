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
| `src/index.ts` | Entry. `createServer()` builds a fresh `McpServer` **per HTTP request** (stateless Streamable HTTP) or one for stdio (`TRANSPORT=stdio`). |
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
- Zod v4 only (`zod ^4`). Input schemas are raw shapes today (SDK v1); SDK v2 will need `z.object(...)`.

## OAuth / Entra ID gotchas (easy to regress)

- Metadata routes must match the **path-aware** form `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server/mcp` (regex routes) — Claude's cloud requests these first.
- AS metadata `issuer` must equal `MCP_SERVER_BASE_URL` (the URL advertised in `authorization_servers`).
- `/authorize` and `/token` swap the DCR `client_id` for `AZURE_PROXY_CLIENT_ID` (+ secret on `/token`). Also accept the real proxy client_id directly (Claude "Advanced settings" static Client ID). Do not forward the client's `Authorization` header to Entra.
- Token-shaped failures (bad claims/signature/kid/alg) must return **401**, not 500 — clients only re-auth on 401.
- OAuth endpoints need CORS incl. `OPTIONS` preflight (`app.options(...)` in `oauth-proxy.ts`).
- DCR registrations must persist across restarts (`data/` volume in docker-compose).

## Deployment

- Nginx vhost and log files are named `mxm-mcp-server` even though the domain is `mcp-server1` — do not "fix" the names.
- Redeploy: pull on the server, `docker compose up -d --build`, then check `/health` and reconnect a client. Details in [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md); Entra app registration in [azure-guide.md](azure-guide.md).

## Git

- Work on a branch, not `main`, for anything beyond docs. Commit only when asked.
- `.env`, `data/` and DCR files contain secrets / client registrations — never commit them.
